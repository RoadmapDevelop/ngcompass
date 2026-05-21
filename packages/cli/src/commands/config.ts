/**
 * @fileoverview
 * `ngcompass config` command group.
 *
 * Currently exposes `config health`, which runs semantic validation against
 * the active configuration (and optional profile) and renders the result via
 * the dedicated config reporter.
 */

import { Command } from 'commander';
import { getConfigReporter } from '@ngcompass/reporters';
import { CacheContext } from '@ngcompass/cache';
import { validateConfig } from '@ngcompass/config';
import { exitWithError, printError } from './exit.js';

export function registerConfigCommand(program: Command, cache: CacheContext) {
    const configGroup = program
        .command('config')
        .description('Inspect and validate ngcompass configuration');

    configGroup
        .command('health')
        .description('Run semantic validation checks for the active configuration')
        .option('-p, --profile <name>', 'Configuration profile to validate')
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
            } catch (error: unknown) {
                printError('Error', error);
                exitWithError();
            }
        });
}
