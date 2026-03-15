import { CacheContext } from '@ngcompass/cache';
import { Command } from 'commander';
import { getCacheReporter } from '@ngcompass/reporters';
import pc from 'picocolors';
import { exitWithError } from './exit.js';

export function registerCacheCommand(program: Command, cache: CacheContext) {
    const cacheCmd = program
        .command('cache')
        .description('Manage cache');

    cacheCmd
        .command('clear')
        .description('Clear all or specific caches')
        .option('--type <type>', 'Cache type: ast|config|results|all', 'all')
        .action(async (options: { type: string }) => {
            const reporter = getCacheReporter();
            console.log('Clearing cache...');

            const type = options.type as 'ast' | 'config' | 'results' | 'all';

            const validTypes = ['ast', 'config', 'results', 'all'];
            if (!validTypes.includes(type)) {
                console.error(pc.red(`Invalid cache type: ${type}. Must be one of: ${validTypes.join(', ')}`));
                exitWithError();
            }

            try {
                if (type === 'all') {
                    await cache.clear();
                } else {
                    await cache.clearType(type);
                }
                reporter.renderClearResult(type);
            } catch (err) {
                console.error(pc.red('Error clearing cache:'), err);
                exitWithError();
            }
        });

    cacheCmd
        .command('info')
        .description('Show cache status and statistics')
        .action(async () => {
            const reporter = getCacheReporter();
            try {
                const info = await cache.getInfo();
                reporter.renderCacheInfo(info);
            } catch (err) {
                console.error(pc.red('Error getting cache info:'), err);
                exitWithError();
            }
        });

    cacheCmd
        .command('path')
        .description('Show cache directory location')
        .action(() => {
            console.log(cache.getCachePath());
        });
}
