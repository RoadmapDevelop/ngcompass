import { Command } from 'commander';
import {
    resolveConfig,
    scan,
    CacheContext,
    resolveRules,
    getEnabledRules,
    buildExecutionPlan,
    filterCachedTasks,
    Task
} from '@ngcompass/core';
import chalk from 'chalk';
import process from 'node:process';
import path from 'node:path';

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
                const rulesResult = await resolveRules(config as any);
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

                const { stats } = planResult.data.indexes;
                const elapsedTime = performance.now() - startTime;

                const formatTask = (task: Task, index: number) => {
                    const rel = (p: string) => path.relative(process.cwd(), p);
                    const shortHash = (h: string) => h.substring(0, 8);

                    const inputs: string[] = [];
                    inputs.push(`${chalk.blue('TS')}:${shortHash(task.inputs.typescript.hash)}${task.inputs.typescript.needsAst ? '*' : ''}`);

                    if (task.inputs.template) {
                        inputs.push(`${chalk.magenta('TPL')}:${shortHash(task.inputs.template.hash)}${task.inputs.template.needsAst ? '*' : ''}`);
                    }
                    if (task.inputs.styles) {
                        task.inputs.styles.forEach(s => inputs.push(`${chalk.green('CSS')}:${shortHash(s.hash)}${s.needsAst ? '*' : ''}`));
                    }
                    if (task.inputs.spec) {
                        inputs.push(`${chalk.cyan('SPEC')}:${shortHash(task.inputs.spec.hash)}${task.inputs.spec.needsAst ? '*' : ''}`);
                    }

                    const opts = JSON.stringify(task.options);
                    return `  ${chalk.gray((index + 1).toString().padStart(2, ' '))} ${chalk.bold.cyan(task.ruleName.padEnd(25))} ${shortHash(task.taskId)} ${task.severity.padEnd(5)} ${chalk.white(rel(task.filePath))} ${chalk.gray(opts)} [${inputs.join(', ')}]`;
                };

                const countInputs = (t: Task) => 1 + (t.inputs.template ? 1 : 0) + (t.inputs.styles?.length || 0) + (t.inputs.spec ? 1 : 0);

                // 5. Incremental Filtering (if enabled)
                if (options.incremental || options.force) {
                    console.log('→ Filtering by cache...');

                    const incrementalPlan = await filterCachedTasks(
                        planResult.data.tasks,
                        cache.results,
                        { forceRerun: !!options.force }
                    );

                    const { cached, pending, stats: cacheStats } = incrementalPlan;
                    const finalTime = performance.now() - startTime;

                    // Final Summary
                    console.log('\n' + chalk.bold('═'.repeat(60)));
                    console.log(chalk.bold.cyan('  Analysis Complete'));
                    console.log(chalk.bold('═'.repeat(60)));
                    console.log(`  ${chalk.bold('Tasks:')}     ${chalk.cyan(stats.totalTasks)} tasks`);
                    console.log(`  ${chalk.bold('Files:')}     ${chalk.cyan(stats.totalFiles)} files`);
                    console.log(`  ${chalk.bold('Cached:')}    ${chalk.green(cached.length)} tasks (${(cacheStats.cacheHitRate * 100).toFixed(1)}%)`);
                    console.log(`  ${chalk.bold('Pending:')}   ${chalk.yellow(pending.length)} tasks`);
                    console.log(`  ${chalk.bold('Time:')}      ${chalk.magenta(finalTime.toFixed(0))}ms`);
                    console.log(chalk.bold('═'.repeat(60)) + '\n');

                    if (pending.length === 0) {
                        console.log(chalk.bold.green('🎉 Everything is up to date!\n'));
                    } else if (options.show) {
                        console.log(chalk.bold(`\nShowing first 50 pending tasks (sorted by most inputs):`));
                        const sorted = [...pending].sort((a, b) => countInputs(b) - countInputs(a));
                        sorted.slice(0, 50).forEach((task, i) => console.log(formatTask(task, i)));
                        if (sorted.length > 50) {
                            console.log(chalk.gray(`  ... and ${sorted.length - 50} more`));
                        }
                    }
                } else {
                    // Final Summary (non-incremental)
                    console.log('\n' + chalk.bold('═'.repeat(60)));
                    console.log(chalk.bold.cyan('  Analysis Complete'));
                    console.log(chalk.bold('═'.repeat(60)));
                    console.log(`  ${chalk.bold('Tasks:')}     ${chalk.cyan(stats.totalTasks)} tasks`);
                    console.log(`  ${chalk.bold('Files:')}     ${chalk.cyan(stats.totalFiles)} files`);
                    console.log(`  ${chalk.bold('Time:')}      ${chalk.magenta(elapsedTime.toFixed(0))}ms`);
                    console.log(chalk.bold('═'.repeat(60)) + '\n');

                    if (options.show) {
                        console.log(chalk.bold(`\nShowing first 50 tasks (sorted by most inputs):`));
                        const sorted = [...planResult.data.tasks].sort((a, b) => countInputs(b) - countInputs(a));
                        sorted.slice(0, 50).forEach((task, i) => console.log(formatTask(task, i)));
                        if (sorted.length > 50) {
                            console.log(chalk.gray(`  ... and ${sorted.length - 50} more`));
                        }
                    }
                }

            } catch (error) {
                console.error(chalk.red(`✗ Error during analysis: ${(error as Error).message}`));
                process.exit(1);
                return;
            }
        });
}

