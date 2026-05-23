/**
 * @fileoverview
 * `ngcompass config` command group.
 *
 * Currently exposes `config health`, which runs semantic validation against
 * the active configuration (and optional profile) and renders the result via
 * the dedicated config reporter.
 */

import process from 'node:process';
import { Command } from 'commander';
import { getConfigReporter } from '@ngcompass/reporters';
import { CacheContext } from '@ngcompass/cache';
import { validateConfig } from '@ngcompass/config';
import { exitWithError, printError } from './exit.js';

interface ConfigHealthOptions {
    readonly profile?: string;
    readonly cache?: boolean;
}

/**
 * Registers configuration validation commands.
 *
 * @param program - Commander root that receives the `config` command group.
 * @param cache - Shared cache context used by config validation when enabled.
 * @returns {void}
 */
export function registerConfigCommand(program: Command, cache: CacheContext): void {
    const configGroup = program
        .command('config')
        .description('Inspect and validate ngcompass configuration');

    configGroup
        .command('health')
        .description('Run semantic validation checks for the active configuration')
        .option('-p, --profile <name>', 'Configuration profile to validate')
        .action(async (options: ConfigHealthOptions) => {
            try {
                const result = await validateConfig({
                    cwd: process.cwd(),
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
