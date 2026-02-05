import { Command } from 'commander';
import {
    resolveConfig,
    scan,
    CacheContext,
    resolveRules,
    getEnabledRules,
    buildExecutionPlan,
} from '@ngcompass/core';
import ora from 'ora';
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
        .option('-v, --verbose', 'Print discovered files')
        .option('--json', 'Output the execution plan in JSON format')
        .action(async (options) => {
            const isJson = !!options.json;
            const spinner = ora({
                text: 'Resolving configuration...',
                isEnabled: !isJson
            }).start();
            try {
                // 1. Load Config
                const configResult = await resolveConfig({
                    profile: options.profile,
                    cache,
                    cwd: process.cwd()
                });

                if (!configResult.report.valid) {
                    spinner.fail('Configuration validation failed');
                    configResult.report.issues.forEach((issue) => {
                        const pathString = issue.path?.join('.') || 'root';
                        console.error(`  [${issue.severity.toUpperCase()}] ${pathString}: ${issue.message}`);
                    });
                    process.exit(1);
                }

                if (!configResult.config) {
                    spinner.fail('No configuration found');
                    process.exit(1);
                }

                const config = configResult.config;
                spinner.stopAndPersist({
                    symbol: '⚙️ ',
                    text: chalk.dim('Configuration resolved')
                }).start();

                // 2. Discover Files
                spinner.text = 'Discovering files...';
                const scanResult = await scan({
                    rootDir: process.cwd(),
                    include: config.include || ['src/**/*.ts'],
                    exclude: config.exclude || [],
                    respectGitignore: true
                });

                if (!scanResult.ok) {
                    spinner.fail(`File discovery failed: ${scanResult.error.message}`);
                    process.exit(1);
                }
                spinner.stopAndPersist({
                    symbol: '🔍',
                    text: chalk.dim(`Discovered ${scanResult.data.files.length} files`)
                }).start();

                // 3. Resolve Rules
                spinner.text = 'Resolving rules...';
                const rulesResult = await resolveRules(config as any);
                if (!rulesResult.ok) {
                    spinner.fail(`Rule resolution failed: ${rulesResult.error.message}`);
                    process.exit(1);
                }
                spinner.stopAndPersist({
                    symbol: '⚖️ ',
                    text: chalk.dim(`Resolved ${rulesResult.data.rules.size} rules`)
                }).start();

                // No success message here to keep output clean

                // 4. Build Execution Plan
                spinner.text = 'Building execution plan...';
                const planResult = buildExecutionPlan({
                    files: scanResult.data.files,
                    rules: getEnabledRules(rulesResult.data.rules),
                    rootDir: process.cwd(),
                });

                if (!planResult.ok) {
                    spinner.fail(`Execution plan building failed: ${planResult.error.message}`);
                    process.exit(1);
                }

                if (isJson) {
                    console.log(JSON.stringify({
                        plan: planResult.data.plan,
                        tasks: planResult.data.tasks,
                        indexes: planResult.data.indexes,
                    }, null, 2));
                    return;
                }

                spinner.stop();

                const { stats } = planResult.data.indexes;
                console.log(`\n✨ Create ${chalk.cyan(stats.totalTasks)} tasks to run across ${chalk.cyan(stats.totalFiles)} files\n`);


            } catch (error) {
                spinner.fail(`Error during analysis: ${(error as Error).message}`);
                if (options.verbose) {
                    console.error(error);
                }
                process.exit(1);
            }
        });
}
