import { Command } from 'commander';
import path from 'node:path';
import pc from 'picocolors';
import { type NormalizedAnalyzerConfig, AnalysisResult, DEFAULT_INCLUDE_PATTERNS, ResolvedRulesMap, RuleResult, type ParseError, type ParserOptions } from '@ngcompass/common';
import { getReporter, type ReporterFormat, type Reporter, type ResultSummary } from '@ngcompass/reporters';
import process from 'node:process';
import { CacheContext, createRuntimeCache } from '@ngcompass/cache';
import { exitWithError } from './exit.js';
import { getGlobalRegistry, executeBatchedNewEngineRules, isNewEngineRule } from '@ngcompass/rules';
import { loadPlugins } from '@ngcompass/config';
import { runAnalysis, configureRuleExecutor, type AnalysisFileProgress } from '@ngcompass/engine';
import { ExecutionPlanOutput, buildExecutionPlan } from '@ngcompass/planner';
import { scan } from '@ngcompass/scanner';
import { resolveRules, getEnabledRules } from '@ngcompass/rules';
import { resolveConfig } from '@ngcompass/config';
interface AnalyzeOptions {
    profile?: string;
    force?: boolean;
    debug?: boolean;
    format?: ReporterFormat;
    compact?: boolean;
    quiet?: boolean;
    recommendation?: boolean;
    rule?: string;
    output?: string;
    maxWorkers?: string;
    typeAwareChunkSize?: string;
    skipTypeCheck?: boolean;
}

function normalizeReporterFormat(format: ReporterFormat | undefined): ReporterFormat {
    if (format === 'ui') return 'html';
    return format ?? 'console';
}

function resolveReporterFormat(
    cliFormat: ReporterFormat | undefined,
    configFormat: NormalizedAnalyzerConfig['outputFormat'] | undefined,
): ReporterFormat {
    if (cliFormat) {
        return normalizeReporterFormat(cliFormat);
    }

    switch (configFormat) {
        case 'json':
            return 'json';
        case 'sarif':
            return 'sarif';
        case 'html':
            return 'html';
        case 'text':
        case undefined:
            return 'console';
        default:
            return 'console';
    }
}

function shouldFailAnalysis(
    config: Pick<NormalizedAnalyzerConfig, 'failOnSeverity' | 'maxWarnings'>,
    stats: Pick<AnalysisResult['stats'], 'totalErrors' | 'totalWarnings'>,
): boolean {
    const failOnSeverity = config.failOnSeverity ?? 'error';
    const maxWarnings = config.maxWarnings ?? 10;

    if (stats.totalErrors > 0) {
        return true;
    }

    if (failOnSeverity === 'warn' && stats.totalWarnings > 0) {
        return true;
    }

    return stats.totalWarnings > maxWarnings;
}

function resolveParserProjectPath(
    parserOptions: ParserOptions | undefined,
    cwd: string,
): string | undefined {
    if (!parserOptions?.project) {
        return undefined;
    }

    const rootDir = parserOptions.tsconfigRootDir
        ? path.resolve(cwd, parserOptions.tsconfigRootDir)
        : cwd;

    return path.resolve(rootDir, parserOptions.project);
}

function formatDuration(ms: number): string {
    if (ms < 1000) return `${Math.max(0, Math.round(ms))}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
}

function pluralise(count: number, singular: string): string {
    return `${count.toLocaleString()} ${singular}${count === 1 ? '' : 's'}`;
}

function createFileProgressLogger(plan: ExecutionPlanOutput, stream: NodeJS.WriteStream, cwd: string) {
    const expectedTasksByFile = new Map<string, number>();
    const executableTaskFiles = plan.tasks
        .map(task => task.filePath)
        .filter((filePath): filePath is string => typeof filePath === 'string' && filePath.length > 0);

    for (const filePath of executableTaskFiles) {
        expectedTasksByFile.set(filePath, (expectedTasksByFile.get(filePath) ?? 0) + 1);
    }

    const completedByFile = new Map<string, AnalysisFileProgress>();
    const printedFiles = new Set<string>();

    return (event: AnalysisFileProgress) => {
        if (printedFiles.has(event.filePath)) return;

        const accumulated = completedByFile.get(event.filePath);
        const next: AnalysisFileProgress = accumulated
            ? {
                filePath: event.filePath,
                taskCount: accumulated.taskCount + event.taskCount,
                issueCount: accumulated.issueCount + event.issueCount,
                errorCount: accumulated.errorCount + event.errorCount,
                warningCount: accumulated.warningCount + event.warningCount,
                duration: accumulated.duration + event.duration,
            }
            : event;
        completedByFile.set(event.filePath, next);

        const expectedTasks = expectedTasksByFile.get(event.filePath) ?? next.taskCount;
        if (next.taskCount < expectedTasks) return;
        printedFiles.add(event.filePath);

        const relativePath = path.relative(cwd, event.filePath) || event.filePath;
        const hasIssues = next.issueCount > 0;
        const status = hasIssues ? pc.red('❯') : pc.green('❯');
        const duration = hasIssues
            ? pc.red(formatDuration(next.duration))
            : pc.green(formatDuration(next.duration));
        const fileLine = hasIssues
            ? `${status} ${pc.red(relativePath)}  ${duration}   ${pc.red(pluralise(next.issueCount, 'issue'))}`
            : `${status} ${pc.dim(relativePath)}  ${duration}`;

        stream.write(`${fileLine}\n`);
    };
}

export function registerAnalyzeCommand(program: Command, cache: CacheContext) {
    program
        .command('analyze')
        .description('Analyze your project and report rule violations and architecture risks')
        .option('-p, --profile <name>', 'Configuration profile to run')
        .option('--force', 'Ignore cached results and re-run all checks')
        .option('--format <fmt>', 'Reporter format: console | json | sarif | html | ui')
        .option('--compact', 'Use compact, ESLint-style output')
        .option('-q, --quiet', 'Show summary counts only, suppress violation details')
        .option('--no-recommendation', 'Suppress fix recommendations from output')
        .option('--output <path>', 'Output path for UI reports (default: ngcompass-report.html)')
        .option('--rule <id>', 'Run only one rule (useful for debugging or focused checks)')
        .option('--max-workers <n>', 'Cap the number of worker threads (lower = less memory, e.g. --max-workers 2)')
        .option('--type-aware-chunk-size <n>', 'Files per type-aware chunk (default 400; lower = less peak memory)')
        .option('--skip-type-check', 'Skip rules that require the TypeScript type checker (fastest, lowest memory)')
        .action(async (options: AnalyzeOptions) => {
            const globalOptions = program.opts();
            const isDebug = !!globalOptions.debug;
            const isVerbose = !!globalOptions.verbose || isDebug;

            const startTime = performance.now();
            let reporter = getReporter(normalizeReporterFormat(options.format), {
                compact: !!options.compact,
                verbose: isVerbose,
                outputPath: options.output,
                quiet: !!options.quiet,
                noRecommendation: options.recommendation === false,
            });
            let activeCache: CacheContext | undefined = cache;

            let exitCode = 0;

            try {
                // 1. Load Config & Plugins
                const configResult = await loadConfigurationStep(options, cache, reporter);
                if (!configResult) { exitCode = 1; return; }

                const { config } = configResult;
                activeCache = createRuntimeCache(config, process.cwd());
                const reporterFormat = resolveReporterFormat(options.format, config.outputFormat);
                reporter = getReporter(reporterFormat, {
                    compact: !!options.compact,
                    verbose: isVerbose,
                    outputPath: options.output ?? config.outputPath,
                    quiet: !!options.quiet,
                    noRecommendation: options.recommendation === false,
                });

                // 2. Discover Files
                const files = await discoverFilesStep(config, options, activeCache, reporter);
                if (!files) { exitCode = 1; return; }

                // 3. Resolve Rules
                const enabledRules = await resolveRulesStep(config, options, reporter);
                if (!enabledRules) { exitCode = 1; return; }

                // 4. Build Execution Plan
                const plan = await buildPlanStep(files, enabledRules, activeCache, options, reporter, config);
                if (!plan) { exitCode = 1; return; }

                // 5. Run Analysis
                const progressStream = (reporterFormat === 'console' ? process.stdout : process.stderr) as NodeJS.WriteStream;
                const logFileProgress = createFileProgressLogger(plan, progressStream, process.cwd());
                const analysis = await runAnalysisStep(plan, activeCache, options, reporter, files, config, undefined, config.maxWorkers, logFileProgress);
                if (!analysis) { exitCode = 1; return; }

                const duration = performance.now() - startTime;

                // Unique files that had at least one task planned (= files the
                // planner actually analysed, regardless of whether they had violations).
                const scannedFiles = new Set([
                    ...plan.tasks.map(t => t.filePath),
                    ...(plan.skippedTasks ?? []).map(t => t.filePath),
                ]).size;

                const summary: ResultSummary = {
                    scannedFiles,
                    discoveredFiles: files.length,
                    totalFiles: analysis.stats.totalFiles,
                    totalTasks: plan.tasks.length + (plan.skippedTasks?.length ?? 0),
                    cachedTasks: plan.precomputedAnalysis ? plan.tasks.length : undefined,
                    totalErrors: analysis.stats.totalErrors,
                    totalWarnings: analysis.stats.totalWarnings,
                    duration
                };
                if (reporterFormat === 'console') {
                    reporter.summary(summary);
                }

                reporter.parseErrors(analysis.parseErrors as ParseError[]);
                reporter.report(analysis.results as RuleResult[]);

                if (reporterFormat !== 'console') {
                    reporter.step('❯ Writing report...');
                    reporter.summary(summary);
                }

                // 7. Save Results to Cache
                if (!plan.precomputedAnalysis) {
                    await saveToCacheStep(analysis.results, activeCache, options, reporter);
                }

                if (shouldFailAnalysis(config, analysis.stats)) {
                    exitCode = 1;
                }
            } catch (error) {
                reporter.error(error as Error);
                exitCode = 1;
            } finally {
                if (activeCache && activeCache !== cache) {
                    await activeCache.flush();
                }
                if (exitCode !== 0) {
                    exitWithError(exitCode);
                }
            }
        });
}

async function loadConfigurationStep(
    options: AnalyzeOptions,
    cache: CacheContext,
    reporter: Reporter
): Promise<{ config: NormalizedAnalyzerConfig } | null> {
    const tStart = performance.now();
    reporter.step('❯ Loading configuration...');

    const configResult = await resolveConfig({
        profile: options.profile,
        cache,
        cwd: process.cwd()
    });

    if (!configResult.report.valid) {
        const issueLines = configResult.report.issues.map((issue) => {
            const pathString = issue.path?.join('.') || 'root';
            return `[${issue.severity.toUpperCase()}] ${pathString}: ${issue.message}`;
        });
        reporter.error(new Error(['Configuration validation failed', ...issueLines].join('\n')));
        return null;
    }

    if (!configResult.config) {
        reporter.error(new Error('No configuration found'));
        return null;
    }

    const pluginList = configResult.config.plugins;
    if (pluginList && pluginList.length > 0) {
        reporter.step(`❯ Loading ${pluginList.length} plugin(s)...`);
        const configDir = process.cwd();
        await loadPlugins(pluginList, configDir, getGlobalRegistry());
        reporter.info(`Loaded ${pluginList.length} plugin(s)`);
    }

    reporter.debug(`Config resolve: ${(performance.now() - tStart).toFixed(2)}ms`);
    return { config: configResult.config };
}

async function discoverFilesStep(
    config: NormalizedAnalyzerConfig,
    options: AnalyzeOptions,
    cache: CacheContext | undefined,
    reporter: Reporter
): Promise<string[] | null> {
    const tStart = performance.now();
    reporter.step('❯ Discovering files...');

    const scanResult = await scan({
        rootDir: process.cwd(),
        include: config.include ?? [...DEFAULT_INCLUDE_PATTERNS],
        exclude: config.exclude ?? [],
        ignorePatterns: config.ignorePatterns,
        tsConfigPath: resolveParserProjectPath(config.parserOptions, process.cwd()),
        respectGitignore: true,
        debug: options.debug,
        cache
    });

    if (!scanResult.ok) {
        reporter.error(new Error(`File discovery failed: ${scanResult.error.message}`));
        return null;
    }

    reporter.info(`❯ Found ${scanResult.data.files.length} files in ${(performance.now() - tStart).toFixed(0)}ms`);
    reporter.debug(`File discovery: ${(performance.now() - tStart).toFixed(2)}ms`);
    return scanResult.data.files as string[];
}

async function resolveRulesStep(
    config: NormalizedAnalyzerConfig,
    options: AnalyzeOptions,
    reporter: Reporter
): Promise<ResolvedRulesMap | null> {
    const tStart = performance.now();
    reporter.step('❯ Loading rules...');

    let effectiveConfig: NormalizedAnalyzerConfig = config;
    if (options.rule) {
        reporter.info(`Filtering analysis to single rule: ${options.rule}`);
        effectiveConfig = {
            ...config,
            rules: {
                [options.rule]: 'error'
            },
            extends: []
        };
    }

    const rulesResult = await resolveRules(effectiveConfig);

    if (!rulesResult.ok) {
        reporter.error(new Error(`Rule resolution failed: ${rulesResult.error.message}`));
        return null;
    }

    const enabledRules = getEnabledRules(rulesResult.data.rules);
    reporter.info(`❯ Loaded ${enabledRules.size} active rules in ${(performance.now() - tStart).toFixed(0)}ms`);
    reporter.debug(`Rule resolution: ${(performance.now() - tStart).toFixed(2)}ms`);
    return enabledRules;
}

async function buildPlanStep(
    files: string[],
    rules: ResolvedRulesMap,
    cache: CacheContext | undefined,
    options: AnalyzeOptions,
    reporter: Reporter,
    config: NormalizedAnalyzerConfig
): Promise<ExecutionPlanOutput | null> {
    const tStart = performance.now();
    reporter.step('❯ Planning analysis...');

    const planResult = await buildExecutionPlan({
        files,
        rules,
        rootDir: process.cwd(),
        cache,
        debug: options.debug,
        incremental: options.force ? { forceRerun: true } : undefined,
        workerCount: config.maxWorkers,
        overrides: config.overrides,
    });

    if (!planResult.ok) {
        reporter.error(new Error(`Execution plan building failed: ${planResult.error.message}`));
        return null;
    }

    if (planResult.data.precomputedAnalysis) {
        reporter.info('❯ Reused cached analysis plan');
    } else {
        reporter.info(`❯ Prepared ${planResult.data.tasks.length.toLocaleString()} checks in ${(performance.now() - tStart).toFixed(0)}ms`);
    }

    reporter.debug(`Plan build: ${(performance.now() - tStart).toFixed(2)}ms`);
    return planResult.data;
}

async function runAnalysisStep(
    plan: ExecutionPlanOutput,
    cache: CacheContext | undefined,
    options: AnalyzeOptions,
    reporter: Reporter,
    files?: ReadonlyArray<string>,
    config?: NormalizedAnalyzerConfig,
    onProgress?: (completed: number, total: number) => void,
    _workerCountForCompatibility?: number,
    onFileProgress?: (event: AnalysisFileProgress) => void,
): Promise<AnalysisResult | null> {
    const tStart = performance.now();
    reporter.step('❯ Running analysis...');

    configureRuleExecutor(executeBatchedNewEngineRules, isNewEngineRule);

    const cliMaxWorkers = options.maxWorkers ? parseInt(options.maxWorkers, 10) : undefined;
    const cliChunkSize = options.typeAwareChunkSize ? parseInt(options.typeAwareChunkSize, 10) : undefined;
    const result = await runAnalysis(plan, {
        rootDir: process.cwd(),
        cache,
        debug: options.debug,
        files,
        maxWorkers: cliMaxWorkers ?? config?.maxWorkers,
        typeAwareChunkSize: cliChunkSize,
        skipTypeCheck: options.skipTypeCheck,
        parserOptions: config?.parserOptions,
        onProgress,
        onFileProgress,
    });

    if (!result.ok) {
        reporter.error(new Error(`Analysis failed: ${result.error.message}`));
        return null;
    }

    reporter.debug(`Execution: ${(performance.now() - tStart).toFixed(2)}ms`);
    return result.data;
}

async function saveToCacheStep(
    results: readonly RuleResult[],
    cache: CacheContext | undefined,
    options: AnalyzeOptions,
    reporter: Reporter
): Promise<void> {
    if (!cache) {
        return;
    }
    const tStart = performance.now();
    const cacheEntries: [string, RuleResult][] = [];

    for (const result of results) {
        if (result.taskId) {
            cacheEntries.push([result.taskId, result]);
        }
    }

    if (cacheEntries.length > 0) {
        await cache.results.setMany(cacheEntries);
        if (options.debug) {
            reporter.debug(`Saved ${cacheEntries.length} results to cache (${(performance.now() - tStart).toFixed(2)}ms)`);
        }
    }
}
