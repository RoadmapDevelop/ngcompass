import { Command } from 'commander';
import {
    resolveConfig,
    scan,
    CacheContext,
    resolveRules,
    getEnabledRules,
    buildExecutionPlan,
    filterCachedTasks
} from '@ngcompass/core';
import { getReporter } from '@ngcompass/reporters';
import { debug } from '@ngcompass/common';
import chalk from 'chalk';
import process from 'node:process';

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
        .action(async (options) => {
            const startTime = performance.now();

            try {
                // 1. Load Config
                const tConfigStart = performance.now();
                console.log('→ Resolving configuration...');
                const configResult = await resolveConfig({
                    profile: options.profile,
                    cache,
                    cwd: process.cwd()
                });
                const tConfigEnd = performance.now();

                if (!configResult.report.valid) {
                    console.error(chalk.red('✗ Configuration validation failed'));
                    configResult.report.issues.forEach((issue) => {
                        const pathString = issue.path?.join('.') || 'root';
                        console.error(`  [${issue.severity.toUpperCase()}] ${pathString}: ${issue.message}`);
                    });
                    process.exit(1);
                    return;
                }

                if (!configResult.config) {
                    console.error(chalk.red('✗ No configuration found'));
                    process.exit(1);
                    return;
                }

                const config = configResult.config;

                // 2. Discover Files
                const tScanStart = performance.now();
                console.log('→ Discovering files...');
                const scanResult = await scan({
                    rootDir: process.cwd(),
                    include: config.include || ['src/**/*.ts'],
                    exclude: config.exclude || [],
                    respectGitignore: true,
                    debug: options.debug,
                    cache
                });
                const tScanEnd = performance.now();

                if (!scanResult.ok) {
                    console.error(chalk.red(`✗ File discovery failed: ${scanResult.error.message}`));
                    process.exit(1);
                    return;
                }

                // 3. Resolve Rules
                const tRulesStart = performance.now();
                console.log('→ Resolving rules...');
                const rulesResult = await resolveRules(config);
                const tRulesEnd = performance.now();

                if (!rulesResult.ok) {
                    console.error(chalk.red(`✗ Rule resolution failed: ${rulesResult.error.message}`));
                    process.exit(1);
                    return;
                }

                // 4. Build Execution Plan
                const tPlanStart = performance.now();
                console.log('→ Building execution plan...');
                const planResult = await buildExecutionPlan({
                    files: scanResult.data.files,
                    rules: getEnabledRules(rulesResult.data.rules),
                    rootDir: process.cwd(),
                    cache,
                    debug: options.debug
                });
                const tPlanEnd = performance.now();

                if (!planResult.ok) {
                    console.error(chalk.red(`✗ Execution plan building failed: ${planResult.error.message}`));
                    process.exit(1);
                    return;
                }

                if (options.debug) {
                    console.log('\n--- Performance Breakdown (Sub-1s Goal) ---');
                    console.log(`Config resolve: ${(tConfigEnd - tConfigStart).toFixed(2)}ms`);
                    console.log(`File discovery: ${(tScanEnd - tScanStart).toFixed(2)}ms`);
                    if (scanResult.data.timings) {
                        const t = scanResult.data.timings;
                        console.log(`  - Normalization: ${t.normalization.toFixed(2)}ms`);
                        console.log(`  - Discovery:    ${t.discovery.toFixed(2)}ms`);
                        console.log(`  - Filtering:    ${t.filtering.toFixed(2)}ms`);
                    }
                    console.log(`Rule resolution: ${(tRulesEnd - tRulesStart).toFixed(2)}ms`);
                    console.log(`Plan build:     ${(tPlanEnd - tPlanStart).toFixed(2)}ms`);
                    console.log(`Total overhead: ${(performance.now() - startTime).toFixed(2)}ms`);
                    console.log('-------------------------------------------\n');
                }

                // 5. Incremental Filtering (if enabled)
                let tasksToExecute = planResult.data.tasks;
                let cachedResults: any[] = [];

                if (options.incremental || options.force) {
                    console.log('→ Filtering by cache...');

                    const incrementalPlan = await filterCachedTasks(
                        planResult.data.tasks,
                        cache.results,
                        { forceRerun: !!options.force }
                    );


                    tasksToExecute = incrementalPlan.pending;

                    const { cached, stats: cacheStats } = incrementalPlan;
                    console.log(`  Cached: ${cached.length} tasks (${(cacheStats.cacheHitRate * 100).toFixed(1)}%)`);
                    console.log(`  Pending: ${tasksToExecute.length} tasks`);

                    // Retrieve cached results to merge later
                    if (cached.length > 0) {
                        try {
                            const cachedMap = await cache.results.getMany(cached.map(t => t.taskId));
                            cachedResults = cached.map(task => {
                                const result = cachedMap.get(task.taskId) as any;
                                if (!result) return null;
                                // Hydrate result with current file path (crucial for accurate reporting)
                                return {
                                    ...result,
                                    failures: result.failures.map((f: any) => ({ ...f, filePath: task.filePath }))
                                };
                            }).filter(r => r !== null);
                        } catch (e) {
                            debug('cache', `Failed to load cached results: ${e instanceof Error ? e.message : String(e)}`);
                        }
                    }
                }

                // 6. Execute Analysis
                console.log(`→ Executing analysis on ${tasksToExecute.length} tasks...`);

                // Lazy import to avoid circular dependency
                const { runAnalysis } = await import('@ngcompass/core');

                const analysisResult = await runAnalysis(tasksToExecute, process.cwd());

                if (!analysisResult.ok) {
                    console.error(chalk.red(`✗ Analysis failed: ${analysisResult.error.message}`));
                    process.exit(1);
                    return;
                }

                const finalTime = performance.now() - startTime;
                const newResults = analysisResult.data.results;
                const allResults = [...newResults, ...cachedResults];

                // Recalculate stats for display from ALL results
                const totalErrors = allResults.flatMap((r: any) => r.failures).filter((f: any) => f.severity === 'critical' || f.severity === 'high').length;
                const totalWarnings = allResults.flatMap((r: any) => r.failures).filter((f: any) => f.severity !== 'critical' && f.severity !== 'high').length;

                // Cache new results (pass & fail)
                const resultsToCache: [string, any][] = [];
                for (const result of newResults) {
                    if (result.taskId) {
                        resultsToCache.push([result.taskId, result]);
                    }
                }

                if (resultsToCache.length > 0) {
                    try {
                        const entries: ReadonlyArray<readonly [string, any]> = resultsToCache;
                        await cache.results.setMany(entries);
                    } catch (e) {
                        debug('cache', `Failed to write cache results: ${e instanceof Error ? e.message : String(e)}`);
                    }
                }

                const results = allResults.filter((r: any) => r.failures.length > 0);

                // 7. Report Results
                const reporter = getReporter('console');

                reporter.summary({
                    totalFiles: scanResult.data.files.length,
                    totalTasks: planResult.data.indexes.stats.totalTasks,
                    cachedTasks: cachedResults.length,
                    totalErrors,
                    totalWarnings,
                    duration: finalTime
                });

                reporter.report(results);

                if (totalErrors > 0) {
                    process.exit(1);
                }

            } catch (error) {
                console.error(chalk.red(`✗ Error during analysis: ${(error as Error).message}`));
                process.exit(1);
                return;
            }
        });
}
