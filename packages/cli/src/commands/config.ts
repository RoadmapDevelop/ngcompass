import { Command } from 'commander';
import { validateConfig, CacheContext } from '@ngcompass/core';
import { getConfigReporter } from '@ngcompass/reporters';

/**
 * Registers the 'config' command and its subcommands.
 */
export function registerConfigCommand(program: Command, cache: CacheContext) {
    const configGroup = program
        .command('config')
        .description('Manage and validate configuration');

    // Health check subcommand
    configGroup
        .command('health')
        .description('Validate the current configuration for semantic correctness')
        .option('-p, --profile <name>', 'Select configuration profile')
        .option('--no-cache', 'Bypass the configuration validation cache')
        .action(async (options) => {
            try {
                const result = await validateConfig({
                    cache: options.cache ? cache : undefined,
                    profile: options.profile
                });

                const reporter = getConfigReporter();
                await reporter.renderHealthReport(result.report);

                const shouldFail = !result.report.valid;

                if (shouldFail) {
                    process.exit(1);
                }
            } catch (error: any) {
                console.error(`Error: ${error.message}`);
                process.exit(1);
            }
        });
}