import { Command } from 'commander';
import { initConfig, CacheContext } from '@ngcompass/core';
import { getConfigReporter } from '@ngcompass/reporters';

/**
 * Registers the 'init' command.
 */
export function registerInitCommand(program: Command, _cache: CacheContext) {
    program
        .command('init')
        .description('Initialize a new ngcompass configuration file')
        .option('-f, --force', 'Overwrite existing configuration')
        .option('--cwd <path>', 'Working directory', process.cwd())
        .action(async (options) => {
            try {
                const result = await initConfig({
                    cwd: options.cwd,
                    force: options.force
                });

                const reporter = getConfigReporter('text');
                await reporter.renderInitResult(result);

                if (!result.success && !result.alreadyExists) {
                    process.exit(1);
                }
            } catch (error: any) {
                console.error(error.message);
                process.exit(1);
            }
        });
}
