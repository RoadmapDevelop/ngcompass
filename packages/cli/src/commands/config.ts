import { Command } from 'commander';
import { getConfigReporter } from '@ngcompass/reporters';
import { CacheContext } from '@ngcompass/cache';
import { validateConfig } from '@ngcompass/config';
import { exitWithError } from './exit.js';

export function registerConfigCommand(program: Command, cache: CacheContext) {
    const configGroup = program
        .command('config')
        .description('Manage and validate configuration');

    configGroup
        .command('health')
        .description('Validate the current configuration for semantic correctness')
        .option('-p, --profile <name>', 'Select configuration profile')
        .action(async (options) => {
            try {
                const result = await validateConfig({
                    cache: options.cache ? cache : undefined,
                    profile: options.profile
                });

                const reporter = getConfigReporter();
                await reporter.renderHealthReport(result.report);

                if (!result.report.valid) {
                    exitWithError();
                }
            } catch (error: any) {
                console.error(`Error: ${error.message}`);
                exitWithError();
            }
        });
}
