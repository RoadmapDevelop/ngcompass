import { Command } from 'commander';
import path from 'node:path';
import { type NormalizedAnalyzerConfig, AnalysisResult, DEFAULT_INCLUDE_PATTERNS, ResolvedRulesMap, RuleResult, type ParseError, type ParserOptions } from '@ngcompass/common';
import { getReporter, type ReporterFormat, type Reporter, type ResultSummary } from '@ngcompass/reporters';
import process from 'node:process';
import { CacheContext, createRuntimeCache } from '@ngcompass/cache';
import { exitWithError } from './exit.js';
import { getGlobalRegistry, executeBatchedNewEngineRules, isNewEngineRule } from '@ngcompass/rules';
import { loadPlugins } from '@ngcompass/config';
import { runAnalysis, configureRuleExecutor } from '@ngcompass/engine';
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
    rule?: string;
    output?: string;
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

export function registerAnalyzeCommand(program: Command, cache: CacheContext) {
    program
        .command('analyze')
        .description('Analyze your project and report rule violations and architecture risks')
        .option('-p, --profile <name>', 'Configuration profile to run')
        .option('--force', 'Ignore cached results and re-run all analysis tasks')
        .option('--format <fmt>', 'Reporter format: console | json | sarif | html | ui')
        .option('--compact', 'Use compact, ESLint-style output')
        .option('--output <path>', 'Output path for UI reports (default: ngcompass-report.html)')
        .option('--rule <id>', 'Run only one rule (useful for debugging or focused checks)')
        .action(async (options: AnalyzeOptions) => {
            const globalOptions = program.opts();
            const isDebug = !!globalOptions.debug;
            const isVerbose = !!globalOptions.verbose || isDebug;

            const startTime = performance.now();
            let reporter = getReporter(normalizeReporterFormat(options.format), {
                compact: !!options.compact,
                verbose: isVerbose,
                outputPath: options.output,
            });
            let activeCache: CacheContext | undefined = cache;

            let exitCode = 0;

            try {
                // 1. Load Config & Plugins
                const configResult = await loadConfigurationStep(options, cache, reporter);
                if (!configResult) { exitCode = 1; return; }

                const { config } = configResult;
                activeCache = createRuntimeCache(config, process.cwd());
                reporter = getReporter(resolveReporterFormat(options.format, config.outputFormat), {
                    compact: !!options.compact,
                    verbose: isVerbose,
                    outputPath: options.output ?? config.outputPath,
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
                const analysis = await runAnalysisStep(plan, activeCache, options, reporter, files, config);
                if (!analysis) { exitCode = 1; return; }

                const duration = performance.now() - startTime;

                // 6. Report Results
                reporter.parseErrors(analysis.parseErrors as ParseError[]);
                reporter.report(analysis.results as RuleResult[]);

                const summary: ResultSummary = {
                    totalFiles: analysis.stats.totalFiles,
                    totalTasks: plan.tasks.length,
                    cachedTasks: plan.precomputedAnalysis ? plan.tasks.length : undefined, // Approximation if precomputed
                    totalErrors: analysis.stats.totalErrors,
                    totalWarnings: analysis.stats.totalWarnings,
                    duration
                };
                reporter.summary(summary);

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
    reporter.step('Resolving configuration...');

    const configResult = await resolveConfig({
        profile: options.profile,
        cache,
        cwd: process.cwd()
    });

    if (!configResult.report.valid) {
        reporter.error(new Error('Configuration validation failed'));
        for (const issue of configResult.report.issues) {
            const pathString = issue.path?.join('.') || 'root';
            reporter.error(new Error(`[${issue.severity.toUpperCase()}] ${pathString}: ${issue.message}`));
        }
        return null;
    }

    if (!configResult.config) {
        reporter.error(new Error('No configuration found'));
        return null;
    }

    const pluginList = configResult.config.plugins;
    if (pluginList && pluginList.length > 0) {
        reporter.step(`Loading ${pluginList.length} plugin(s)...`);
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
    reporter.step('Discovering files...');

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

    reporter.info(`Found ${scanResult.data.files.length} files in ${(performance.now() - tStart).toFixed(0)}ms`);
    reporter.debug(`File discovery: ${(performance.now() - tStart).toFixed(2)}ms`);
    return scanResult.data.files as string[];
}

async function resolveRulesStep(
    config: NormalizedAnalyzerConfig,
    options: AnalyzeOptions,
    reporter: Reporter
): Promise<ResolvedRulesMap | null> {
    const tStart = performance.now();
    reporter.step('Resolving rules...');

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
    reporter.info(`Resolved ${enabledRules.size} active rules in ${(performance.now() - tStart).toFixed(0)}ms`);
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
    reporter.step('Building execution plan...');

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
        reporter.info('Using cached analysis plan (short-circuit)');
    } else {
        reporter.info(`Generated ${planResult.data.tasks.length} tasks in ${(performance.now() - tStart).toFixed(0)}ms`);
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
): Promise<AnalysisResult | null> {
    const tStart = performance.now();
    reporter.step('Running analysis...');

    configureRuleExecutor(executeBatchedNewEngineRules, isNewEngineRule);

    const result = await runAnalysis(plan, {
        rootDir: process.cwd(),
        cache,
        debug: options.debug,
        files,
        maxWorkers: config?.maxWorkers,
        parserOptions: config?.parserOptions,
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
