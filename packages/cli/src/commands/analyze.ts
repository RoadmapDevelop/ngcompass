import { Command } from 'commander';
import {
    resolveConfig,
    scan,
    CacheContext,
    resolveRules,
    getEnabledRules,
    buildExecutionPlan,
    runAnalysis
} from '@ngcompass/core';
import { getReporter } from '@ngcompass/reporters';
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

                // 5. Run Analysis
                const tExecStart = performance.now();
                console.log('→ Running analysis...');
                const result = await runAnalysis(planResult.data, {
                    rootDir: process.cwd(),
                    cache
                });
                const tExecEnd = performance.now();

                if (!result.ok) {
                    console.error(chalk.red(`✗ Analysis failed: ${result.error.message}`));
                    process.exit(1);
                    return;
                }

                const analysis = result.data;
                const duration = (tExecEnd - tExecStart).toFixed(2);
                console.log(chalk.green(`✓ Analysis complete in ${duration}ms`));
                console.log(`  Files: ${analysis.stats.totalFiles}`);
                console.log(`  Errors: ${analysis.stats.totalErrors}`);
                console.log(`  Warnings: ${analysis.stats.totalWarnings}`);

                // 6. Report Results
                const reporter = getReporter((config as any).reporter || 'default');
                await reporter.report([...analysis.results]);

                // 7. Save Results to Cache
                if (cache) {
                    const tCacheStart = performance.now();
                    const cacheEntries: [string, any][] = [];

                    for (const result of analysis.results) {
                        if (result.taskId) {
                            cacheEntries.push([result.taskId, result]);
                        }
                    }

                    if (cacheEntries.length > 0) {
                        await cache.results.setMany(cacheEntries);
                        const tCacheEnd = performance.now();
                        if (options.debug) {
                            console.log(`[ngcompass:cache] Saved ${cacheEntries.length} results to cache (${(tCacheEnd - tCacheStart).toFixed(2)}ms)`);
                        }
                    }
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
                    console.log(`Plan build:     ${(tPlanEnd - tPlanStart).toFixed(2)}ms`); // Uses cached/incremental plan
                    console.log(`Execution:      ${duration}ms`); // Uses skipped/cached results
                    console.log(`Total overhead: ${(performance.now() - startTime).toFixed(2)}ms`);
                    console.log('-------------------------------------------\n');
                }

                if (analysis.stats.totalErrors > 0) {
                    process.exit(1);
                }
            } catch (error) {
                console.error(chalk.red(`✗ Error during analysis: ${(error as Error).message}`));
                process.exit(1);
                return;
            }
        });
}
