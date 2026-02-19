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
        .option('--format <fmt>', 'Output format: console|json', 'console')
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

                // 1.5 Load Plugins (between config and rule resolution)
                const pluginList = (config as any).plugins as string[] | undefined;
                if (pluginList && pluginList.length > 0) {
                    console.log(chalk.blue(`→ Loading ${pluginList.length} plugin(s)...`));
                    // configDir is the directory containing ngcompass.config.ts
                    const configDir = configResult.config ? process.cwd() : process.cwd();
                    await loadPlugins(pluginList, configDir, getGlobalRegistry());
                    console.log(chalk.dim(`  Loaded ${pluginList.length} plugin(s)`));
                }

                // 2. Discover Files
                const tScanStart = performance.now();
                console.log(chalk.blue('→ Discovering files...'));
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

                console.log(chalk.dim(`  Found ${scanResult.data.files.length} files in ${(tScanEnd - tScanStart).toFixed(0)}ms`));

                // 3. Resolve Rules
                const tRulesStart = performance.now();
                console.log(chalk.blue('→ Resolving rules...'));
                const rulesResult = await resolveRules(config);
                const tRulesEnd = performance.now();

                if (!rulesResult.ok) {
                    console.error(chalk.red(`✗ Rule resolution failed: ${rulesResult.error.message}`));
                    process.exit(1);
                    return;
                }

                const enabledRules = getEnabledRules(rulesResult.data.rules);
                console.log(chalk.dim(`  Resolved ${enabledRules.size} active rules in ${(tRulesEnd - tRulesStart).toFixed(0)}ms`));

                // 4. Build Execution Plan
                const tPlanStart = performance.now();
                console.log(chalk.blue('→ Building execution plan...'));
                const planResult = await buildExecutionPlan({
                    files: scanResult.data.files,
                    rules: enabledRules,
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

                if (planResult.data.precomputedAnalysis) {
                    console.log(chalk.dim(`  Using cached analysis plan (short-circuit)`));
                } else {
                    console.log(chalk.dim(`  Generated ${planResult.data.tasks.length} tasks in ${(tPlanEnd - tPlanStart).toFixed(0)}ms`));
                }

                // 5. Run Analysis
                const tExecStart = performance.now();
                console.log(chalk.blue('→ Running analysis...'));
                const result = await runAnalysis(planResult.data, {
                    rootDir: process.cwd(),
                    cache,
                    debug: options.debug
                });
                const tExecEnd = performance.now();

                if (!result.ok) {
                    console.error(chalk.red(`✗ Analysis failed: ${result.error.message}`));
                    process.exit(1);
                    return;
                }

                const analysis = result.data;
                const duration = (tExecEnd - tExecStart).toFixed(0);

                if (options.debug) {
                    console.log('\n--- Performance Breakdown ---');
                    console.log(`Config resolve: ${(tConfigEnd - tConfigStart).toFixed(2)}ms`);
                    console.log(`File discovery: ${(tScanEnd - tScanStart).toFixed(2)}ms`);
                    console.log(`Rule resolution: ${(tRulesEnd - tRulesStart).toFixed(2)}ms`);
                    console.log(`Plan build:     ${(tPlanEnd - tPlanStart).toFixed(2)}ms`);
                    console.log(`Execution:      ${duration}ms`);
                }

                console.log('\n' + chalk.green(`✓ Analysis complete`));
                console.log(chalk.bold(`  Total Time: ${(performance.now() - startTime).toFixed(2)}ms`));
                console.log(`  Files:      ${analysis.stats.totalFiles}`);
                console.log(`  Errors:     ${analysis.stats.totalErrors}`);
                console.log(`  Warnings:   ${analysis.stats.totalWarnings}`);

                // Print parse errors if any (Change 3)
                if (analysis.parseErrors && analysis.parseErrors.length > 0) {
                    console.log(chalk.red(`\nParse Errors (${analysis.parseErrors.length}):`));
                    for (const pe of analysis.parseErrors) {
                        console.log(chalk.red(`  ${pe.filePath}: ${pe.message}`));
                    }
                }

                // 6. Report Results — format determined by --format flag
                const reporter = getReporter(options.format || 'console');
                await reporter.report([...analysis.results]);

                // 7. Save Results to Cache
                if (cache && !planResult.data.precomputedAnalysis) {
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
