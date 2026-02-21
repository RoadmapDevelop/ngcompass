import { Command } from 'commander';
import {
    resolveConfig,
    scan,
    CacheContext,
    resolveRules,
    getEnabledRules,
    buildExecutionPlan,
    runAnalysis,
    loadPlugins,
    getGlobalRegistry,
    type ExecutionPlanOutput,
    type AnalysisResult,
    type RuleResult,
    type ResolvedRulesMap
} from '@ngcompass/core';
import { type ConfigValidationResult } from '@ngcompass/common';
import { getReporter, type ReporterFormat, type Reporter, type ResultSummary } from '@ngcompass/reporters';
import process from 'node:process';

interface AnalyzeOptions {
    profile?: string;
    incremental?: boolean;
    force?: boolean;
    show?: boolean;
    debug?: boolean;
    format?: string;
    verbose?: boolean;
    compact?: boolean;
    rule?: string;
}

/**
 * Registers the 'analyze' command.
 */
export function registerAnalyzeCommand(program: Command, cache: CacheContext) {
    program
        .command('analyze')
        .description('Run analysis on the project')
        .option('-p, --profile <name>', 'Configuration profile to use')
        .option('--incremental', 'Enable incremental analysis (only run changed files)')
        .option('--force', 'Force re-execution of all tasks')
        .option('--show', 'Display the first 50 tasks')
        .option('--debug', 'Enable debug timing output')
        .option('--format <fmt>', 'Output format: console|json', 'console')
        .option('--verbose', 'Show an actionable recommendation for each violation')
        .option('--compact', 'Use compact ESLint-style output instead of the rich default')
        .option('--rule <id>', 'Run only a single rule in isolation')
        .action(async (options: AnalyzeOptions) => {
            const startTime = performance.now();
            const format = (options.format ?? 'console') as ReporterFormat;
            const reporter = getReporter(format, { verbose: !!options.verbose, compact: !!options.compact });

            try {
                // 1. Load Config & Plugins
                const configResult = await loadConfigurationStep(options, cache, reporter);
                if (!configResult) return;

                const { config } = configResult;

                // 2. Discover Files
                const files = await discoverFilesStep(config, options, cache, reporter);
                if (!files) return;

                // 3. Resolve Rules
                const enabledRules = await resolveRulesStep(config, options, reporter);
                if (!enabledRules) return;

                // 4. Build Execution Plan
                const plan = await buildPlanStep(files, enabledRules, cache, options, reporter);
                if (!plan) return;

                // 5. Run Analysis
                const analysis = await runAnalysisStep(plan, cache, options, reporter);
                if (!analysis) return;

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
                    process.exit(1);
                }
            } catch (error) {
                reporter.error(error as Error);
                process.exit(1);
            }
        });
}

async function loadConfigurationStep(
    options: AnalyzeOptions,
    cache: CacheContext,
    reporter: Reporter
): Promise<ConfigValidationResult | null> {
    const tStart = performance.now();
    reporter.step('Resolving configuration...');

    const configResult = await resolveConfig({
        profile: options.profile,
        cache,
        cwd: process.cwd()
    });

    if (!configResult.report.valid) {
        reporter.error(new Error('Configuration validation failed'));
        configResult.report.issues.forEach((issue) => {
            const pathString = issue.path?.join('.') || 'root';
            reporter.error(new Error(`[${issue.severity.toUpperCase()}] ${pathString}: ${issue.message}`));
        });
        process.exit(1);
        return null;
    }

    if (!configResult.config) {
        reporter.error(new Error('No configuration found'));
        process.exit(1);
        return null;
    }

    const pluginList = (configResult.config as any).plugins as string[] | undefined;
    if (pluginList && pluginList.length > 0) {
        reporter.step(`Loading ${pluginList.length} plugin(s)...`);
        const configDir = process.cwd();
        await loadPlugins(pluginList, configDir, getGlobalRegistry());
        reporter.info(`Loaded ${pluginList.length} plugin(s)`);
    }

    reporter.debug(`Config resolve: ${(performance.now() - tStart).toFixed(2)}ms`);
    return configResult;
}

async function discoverFilesStep(
    config: any,
    options: AnalyzeOptions,
    cache: CacheContext,
    reporter: Reporter
): Promise<string[] | null> {
    const tStart = performance.now();
    reporter.step('Discovering files...');

    const scanResult = await scan({
        rootDir: process.cwd(),
        include: config.include || ['src/**/*.ts'],
        exclude: config.exclude || [],
        respectGitignore: true,
        debug: options.debug,
        cache
    });

    if (!scanResult.ok) {
        reporter.error(new Error(`File discovery failed: ${scanResult.error.message}`));
        process.exit(1);
        return null;
    }

    reporter.info(`Found ${scanResult.data.files.length} files in ${(performance.now() - tStart).toFixed(0)}ms`);
    reporter.debug(`File discovery: ${(performance.now() - tStart).toFixed(2)}ms`);
    return scanResult.data.files as string[];
}

async function resolveRulesStep(
    config: any,
    options: AnalyzeOptions,
    reporter: Reporter
): Promise<ResolvedRulesMap | null> {
    const tStart = performance.now();
    reporter.step('Resolving rules...');

    // If --rule <id> is specified, override config to only run that rule
    if (options.rule) {
        reporter.info(`Filtering analysis to single rule: ${options.rule}`);
        // Create a deep copy or just override the rules object
        config = {
            ...config,
            rules: {
                [options.rule]: 'error' // Ensure it's active
            },
            // Disable extends for isolation if needed, but usually overrides are enough
            extends: []
        };
    }

    const rulesResult = await resolveRules(config);

    if (!rulesResult.ok) {
        reporter.error(new Error(`Rule resolution failed: ${rulesResult.error.message}`));
        process.exit(1);
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
        debug: options.debug
    });

    if (!planResult.ok) {
        reporter.error(new Error(`Execution plan building failed: ${planResult.error.message}`));
        process.exit(1);
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
    reporter: Reporter
): Promise<AnalysisResult | null> {
    const tStart = performance.now();
    reporter.step('Running analysis...');

    const result = await runAnalysis(plan, {
        rootDir: process.cwd(),
        cache,
        debug: options.debug
    });

    if (!result.ok) {
        reporter.error(new Error(`Analysis failed: ${result.error.message}`));
        process.exit(1);
        return null;
    }

    reporter.debug(`Execution: ${(performance.now() - tStart).toFixed(2)}ms`);
    return result.data;
}

async function saveToCacheStep(
    results: RuleResult[],
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
