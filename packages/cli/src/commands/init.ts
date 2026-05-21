/**
 * @fileoverview
 * `ngcompass init` command.
 *
 * Scaffolds a starter `ngcompass.config.ts` in the current directory. The
 * existence check is intentionally scoped to the target directory only — see
 * `initConfig()` in `@ngcompass/config` for why ancestor lookups are wrong here.
 */

import { Command } from 'commander';
import { getConfigReporter } from '@ngcompass/reporters';
import { CacheContext } from '@ngcompass/cache';
import { initConfig } from '@ngcompass/config';
import { exitWithError, printError } from './exit.js';

export function registerInitCommand(program: Command, _cache: CacheContext) {
    program
        .command('init')
        .description('Create a starter ngcompass configuration in the current project')
        .option('-f, --force', 'Overwrite an existing configuration file')
        .option('--cwd <path>', 'Project directory where the configuration will be created', process.cwd())
        .action(async (options) => {
            try {
                const result = await initConfig({
                    cwd: options.cwd,
                    force: options.force
                });

                const reporter = getConfigReporter();
                await reporter.renderInitResult(result);

                if (!result.success && !result.alreadyExists) {
                    exitWithError();
                }
            } catch (error: unknown) {
                printError('Error initializing configuration', error);
                exitWithError();
            }
        });
}
