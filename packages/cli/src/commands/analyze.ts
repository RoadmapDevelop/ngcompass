import { Command, Option } from 'commander';
import path from 'node:path';
import pc from 'picocolors';
import { type NormalizedAnalyzerConfig, AnalysisResult, DEFAULT_INCLUDE_PATTERNS, ResolvedRulesMap, RuleResult, type ParseError, type ParserOptions } from '@ngcompass/common';
import { getReporter, type ReporterFormat, type Reporter, type ResultSummary } from '@ngcompass/reporters';
import process from 'node:process';
import { CacheContext, createRuntimeCache } from '@ngcompass/cache';
import { exitWithError } from './exit.js';
import { Spinner } from '../spinner.js';
import { getGlobalRegistry, executeBatchedNewEngineRules, isNewEngineRule } from '@ngcompass/rules';
import { loadPlugins } from '@ngcompass/config';
import { runAnalysis, configureRuleExecutor, type AnalysisFileProgress } from '@ngcompass/engine';
import { ExecutionPlanOutput, buildExecutionPlan } from '@ngcompass/planner';
import { scan } from '@ngcompass/scanner';
import { resolveRules, getEnabledRules } from '@ngcompass/rules';
import { resolveConfig } from '@ngcompass/config';
type PerformanceMode = 'eco' | 'balanced' | 'turbo';
type TypeAwareIsolation = 'auto' | 'process' | 'off';
type TypeAwareChunkStrategy = 'dependency' | 'simple';

interface PerformanceModeOptions {
    typeAwareChunkSize: number;
    typeAwareIsolation: TypeAwareIsolation;
    typeAwareChunkStrategy: TypeAwareChunkStrategy;
    typeAwareConcurrency: number;
    typeAwareFileConcurrency: number;
}

interface EffectivePerformanceOptions extends PerformanceModeOptions {
    maxWorkers: number;
}

const PERFORMANCE_MODE_PRESETS: Record<PerformanceMode, PerformanceModeOptions> = {
    eco: {
        typeAwareConcurrency: 1,
        typeAwareFileConcurrency: 1,
        typeAwareChunkSize: 100,
        typeAwareIsolation: 'auto',
        typeAwareChunkStrategy: 'dependency',
    },
    balanced: {
        typeAwareConcurrency: 2,
        typeAwareFileConcurrency: 2,
        typeAwareChunkSize: 300,
        typeAwareIsolation: 'auto',
        typeAwareChunkStrategy: 'simple',
    },
    turbo: {
        typeAwareConcurrency: 2,
        typeAwareFileConcurrency: 4,
        typeAwareChunkSize: 500,
        typeAwareIsolation: 'off',
        typeAwareChunkStrategy: 'simple',
    },
};

const PERFORMANCE_MODES = Object.keys(PERFORMANCE_MODE_PRESETS) as PerformanceMode[];
const TYPE_AWARE_ISOLATION_MODES: TypeAwareIsolation[] = ['auto', 'process', 'off'];
const TYPE_AWARE_CHUNK_STRATEGIES: TypeAwareChunkStrategy[] = ['dependency', 'simple'];

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
    mode?: string;
    maxWorkers?: string;
    typeAwareChunkSize?: string;
    typeAwareIsolation?: string;
    typeAwareChunkStrategy?: string;
    typeAwareConcurrency?: string;
    typeAwareFileConcurrency?: string;
    skipTypeCheck?: boolean;
}

function parsePositiveIntegerOption(value: string | undefined, optionName: string): number | undefined {
    if (value === undefined) {
        return undefined;
    }

    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1) {
        throw new Error(`${optionName} must be a positive integer.`);
    }

    return parsed;
}

function parsePerformanceMode(value: string | undefined): PerformanceMode {
    const mode = value ?? 'balanced';
    if (!PERFORMANCE_MODES.includes(mode as PerformanceMode)) {
        throw new Error(`Invalid performance mode "${mode}". Expected one of: ${PERFORMANCE_MODES.join(', ')}.`);
    }

    return mode as PerformanceMode;
}

function parseTypeAwareIsolation(value: string | undefined): TypeAwareIsolation | undefined {
    if (value === undefined) {
        return undefined;
    }

    if (!TYPE_AWARE_ISOLATION_MODES.includes(value as TypeAwareIsolation)) {
        throw new Error(`Invalid --type-aware-isolation "${value}". Expected one of: ${TYPE_AWARE_ISOLATION_MODES.join(', ')}.`);
    }

    return value as TypeAwareIsolation;
}

function parseTypeAwareChunkStrategy(value: string | undefined): TypeAwareChunkStrategy | undefined {
    if (value === undefined) {
        return undefined;
    }

    if (!TYPE_AWARE_CHUNK_STRATEGIES.includes(value as TypeAwareChunkStrategy)) {
        throw new Error(`Invalid --type-aware-chunk-strategy "${value}". Expected one of: ${TYPE_AWARE_CHUNK_STRATEGIES.join(', ')}.`);
    }

    return value as TypeAwareChunkStrategy;
}

function resolvePerformanceOptions(
    options: AnalyzeOptions,
    config: Pick<NormalizedAnalyzerConfig, 'maxWorkers'>,
): EffectivePerformanceOptions {
    const mode = parsePerformanceMode(options.mode);
    const preset = PERFORMANCE_MODE_PRESETS[mode];
    const cliMaxWorkers = parsePositiveIntegerOption(options.maxWorkers, '--max-workers');
    const cliChunkSize = parsePositiveIntegerOption(options.typeAwareChunkSize, '--type-aware-chunk-size');
    const cliTypeAwareConcurrency = parsePositiveIntegerOption(options.typeAwareConcurrency, '--type-aware-concurrency');
    const cliTypeAwareFileConcurrency = parsePositiveIntegerOption(options.typeAwareFileConcurrency, '--type-aware-file-concurrency');

    return {
        maxWorkers: cliMaxWorkers ?? config.maxWorkers,
        typeAwareChunkSize: cliChunkSize ?? preset.typeAwareChunkSize,
        typeAwareConcurrency: cliTypeAwareConcurrency ?? preset.typeAwareConcurrency,
        typeAwareFileConcurrency: cliTypeAwareFileConcurrency ?? preset.typeAwareFileConcurrency,
        typeAwareIsolation: parseTypeAwareIsolation(options.typeAwareIsolation) ?? preset.typeAwareIsolation,
        typeAwareChunkStrategy: parseTypeAwareChunkStrategy(options.typeAwareChunkStrategy) ?? preset.typeAwareChunkStrategy,
    };
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

function getAnalyzeMode(options: AnalyzeOptions): string {
    return options.mode ?? 'balanced';
}

function formatAnalysisProgressMessage(mode: string, completed: number, total: number): string {
    return `Running analysis in ${mode} mode: ${completed.toLocaleString()}/${total.toLocaleString()} checks complete...`;
}

function createFileProgressLogger(plan: ExecutionPlanOutput, writeLine: (line: string) => void, cwd: string) {
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

        writeLine(fileLine);
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
        .option('--mode <mode>', 'Performance mode: eco | balanced | turbo (default: balanced)', 'balanced')
        .option('--max-workers <n>', 'Cap the number of worker threads (lower = less memory, e.g. --max-workers 2)')
        .addOption(new Option('--type-aware-chunk-size <n>', 'Files per type-aware chunk').hideHelp())
        .addOption(new Option('--type-aware-concurrency <n>', 'Concurrent type-aware chunks').hideHelp())
        .addOption(new Option('--type-aware-file-concurrency <n>', 'Concurrent files per type-aware chunk').hideHelp())
        .addOption(new Option('--type-aware-isolation <mode>', 'Type-aware isolation: auto | process | off').hideHelp())
        .addOption(new Option('--type-aware-chunk-strategy <mode>', 'Type-aware chunk ordering: dependency | simple').hideHelp())
        .option('--skip-type-check', 'Skip rules that require the TypeScript type checker (fastest, lowest memory)')
        .action(async (options: AnalyzeOptions) => {
            const startTime = performance.now();
            let reporter = getReporter(normalizeReporterFormat(options.format), {
                compact: !!options.compact,
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
                const performanceOptions = resolvePerformanceOptions(options, config);
                activeCache = createRuntimeCache(config, process.cwd());
                const reporterFormat = resolveReporterFormat(options.format, config.outputFormat);
                reporter = getReporter(reporterFormat, {
                    compact: !!options.compact,
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
                const plan = await buildPlanStep(files, enabledRules, activeCache, options, reporter, config, performanceOptions.maxWorkers);
                if (!plan) { exitCode = 1; return; }

                // 5. Run Analysis
                const progressStream = (reporterFormat === 'console' ? process.stdout : process.stderr) as NodeJS.WriteStream;
                const spinner = new Spinner(progressStream);
                const totalChecks = plan.tasks.length + (plan.skippedTasks?.length ?? 0);
                const mode = getAnalyzeMode(options);
                spinner.start(formatAnalysisProgressMessage(mode, 0, totalChecks));
                const logFileProgress = createFileProgressLogger(plan, line => spinner.writeLine(line), process.cwd());
                const updateAnalysisProgress = (completed: number, total: number) => {
                    spinner.update(formatAnalysisProgressMessage(mode, completed, total));
                };
                const analysis = await runAnalysisStep(plan, activeCache, performanceOptions, options, reporter, files, config, updateAnalysisProgress, logFileProgress);
                spinner.stop();
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
                    failOnSeverity: config.failOnSeverity,
                    maxWarnings: config.maxWarnings,
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
    config: NormalizedAnalyzerConfig,
    maxWorkers: number
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
        workerCount: maxWorkers,
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
    performanceOptions: EffectivePerformanceOptions,
    options: AnalyzeOptions,
    reporter: Reporter,
    files?: ReadonlyArray<string>,
    config?: NormalizedAnalyzerConfig,
    onProgress?: (completed: number, total: number) => void,
    onFileProgress?: (event: AnalysisFileProgress) => void,
): Promise<AnalysisResult | null> {
    const tStart = performance.now();
    // spinner shown by caller

    configureRuleExecutor(executeBatchedNewEngineRules, isNewEngineRule);

    const result = await runAnalysis(plan, {
        rootDir: process.cwd(),
        cache,
        debug: options.debug,
        files,
        maxWorkers: performanceOptions.maxWorkers,
        typeAwareChunkSize: performanceOptions.typeAwareChunkSize,
        typeAwareConcurrency: performanceOptions.typeAwareConcurrency,
        typeAwareFileConcurrency: performanceOptions.typeAwareFileConcurrency,
        typeAwareIsolation: performanceOptions.typeAwareIsolation,
        typeAwareChunkStrategy: performanceOptions.typeAwareChunkStrategy,
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
