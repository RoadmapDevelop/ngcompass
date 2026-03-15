import { Command } from 'commander';

import { type NormalizedAnalyzerConfig, AnalysisResult, DEFAULT_INCLUDE_PATTERNS, ResolvedRulesMap, RuleResult } from '@ngcompass/common';
import { getReporter, type ReporterFormat, type Reporter, type ResultSummary } from '@ngcompass/reporters';
import process from 'node:process';
import { CacheContext } from '@ngcompass/cache';
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
    format?: string;
    compact?: boolean;
    rule?: string;
    output?: string;
}


export function registerAnalyzeCommand(program: Command, cache: CacheContext) {
    program
        .command('analyze')
        .description('Run analysis on the project')
        .option('-p, --profile <name>', 'Configuration profile to use')
        .option('--force', 'Force re-execution of all tasks')
        .option('--format <fmt>', 'Output format: console|json|html', 'console')
        .option('--compact', 'Use compact ESLint-style output instead of the rich default')
        .option('--output <path>', 'Output file path for --format html (default: ngcompass-report.html)')
        .option('--rule <id>', 'Run only a single rule in isolation')
        .action(async (options: AnalyzeOptions) => {
            const globalOptions = program.opts();
            const isDebug = !!globalOptions.debug;
            const isVerbose = !!globalOptions.verbose || isDebug;

            const startTime = performance.now();
            const format = (options.format ?? 'console') as ReporterFormat;
            const reporter = getReporter(format, {
                compact: !!options.compact,
                verbose: isVerbose,
                outputPath: options.output,
            });

            let exitCode = 0;

            try {
                // 1. Load Config & Plugins
                const configResult = await loadConfigurationStep(options, cache, reporter);
                if (!configResult) { exitCode = 1; return; }

                const { config } = configResult;

                // 2. Discover Files
                const files = await discoverFilesStep(config, options, cache, reporter);
                if (!files) { exitCode = 1; return; }

                // 3. Resolve Rules
                const enabledRules = await resolveRulesStep(config, options, reporter);
                if (!enabledRules) { exitCode = 1; return; }

                // 4. Build Execution Plan
                const plan = await buildPlanStep(files, enabledRules, cache, options, reporter);
                if (!plan) { exitCode = 1; return; }

                // 5. Run Analysis
                // CTX-001: pass `files` so ProjectContext knows the full set of project files
                const analysis = await runAnalysisStep(plan, cache, options, reporter, files);
                if (!analysis) { exitCode = 1; return; }

                const duration = performance.now() - startTime;

                // 6. Report Results
                reporter.parseErrors(analysis.parseErrors as any);
                reporter.report(analysis.results as any);

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
                    await saveToCacheStep(analysis.results, cache, options, reporter);
                }

                if (analysis.stats.totalErrors > 0) {
                    exitCode = 1;
                }
            } catch (error) {
                reporter.error(error as Error);
                exitCode = 1;
            } finally {
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
    cache: CacheContext,
    reporter: Reporter
): Promise<string[] | null> {
    const tStart = performance.now();
    reporter.step('Discovering files...');

    const scanResult = await scan({
        rootDir: process.cwd(),
        include: config.include ?? [...DEFAULT_INCLUDE_PATTERNS],
        exclude: config.exclude ?? [],
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
    cache: CacheContext,
    options: AnalyzeOptions,
    reporter: Reporter
): Promise<ExecutionPlanOutput | null> {
    const tStart = performance.now();
    reporter.step('Building execution plan...');

    const planResult = await buildExecutionPlan({
        files,
        rules,
        rootDir: process.cwd(),
        cache,
        debug: options.debug,
        incremental: options.force ? { forceRerun: true } : undefined
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
    cache: CacheContext,
    options: AnalyzeOptions,
    reporter: Reporter,
    /** CTX-001: scanner-discovered files — forwarded to ProjectContext builder. */
    files?: ReadonlyArray<string>,
): Promise<AnalysisResult | null> {
    const tStart = performance.now();
    reporter.step('Running analysis...');

    configureRuleExecutor(executeBatchedNewEngineRules, isNewEngineRule);

    const result = await runAnalysis(plan, {
        rootDir: process.cwd(),
        cache,
        debug: options.debug,
        files,
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
    cache: CacheContext,
    options: AnalyzeOptions,
    reporter: Reporter
): Promise<void> {
    const tStart = performance.now();
    const cacheEntries: [string, any][] = [];

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
