import { CacheContext, createRuntimeCache } from '@ngcompass/cache';
import { Command } from 'commander';
import { getCacheReporter } from '@ngcompass/reporters';
import { resolveConfig } from '@ngcompass/config';
import pc from 'picocolors';
import process from 'node:process';
import { exitWithError } from './exit.js';
export function registerCacheCommand(program: Command, cache: CacheContext) {
    const cacheCmd = program
        .command('cache')
        .description('Inspect and manage analysis cache data');

    cacheCmd
        .command('clear')
        .description('Clear cached data for one cache type or all cache types')
        .option('-p, --profile <name>', 'Configuration profile used to resolve cache settings')
        .option('--type <type>', 'Cache type to clear: ast | config | results | all', 'all')
        .action(async (options: { type: string; profile?: string }) => {
            const reporter = getCacheReporter();
            process.stdout.write(pc.dim('  › Clearing cache...\n'));

            const type = options.type as 'ast' | 'config' | 'results' | 'all';

            const validTypes = ['ast', 'config', 'results', 'all'];
            if (!validTypes.includes(type)) {
                console.error(pc.red(`Invalid cache type: ${type}. Must be one of: ${validTypes.join(', ')}`));
                exitWithError();
            }

            try {
                const activeCache = await resolveRuntimeCache(cache, {
                    profile: options.profile,
                    allowDisabled: true,
                });

                if (type === 'all') {
                    await activeCache.clear();
                } else {
                    await activeCache.clearType(type);
                }
                reporter.renderClearResult(type);
            } catch (err) {
                console.error(pc.red('Error clearing cache:'), err);
                exitWithError();
            }
        });

    cacheCmd
        .command('info')
        .description('Show cache status, size, and usage details')
        .option('-p, --profile <name>', 'Configuration profile used to resolve cache settings')
        .action(async (options: { profile?: string }) => {
            const reporter = getCacheReporter();
            try {
                const activeCache = await resolveRuntimeCache(cache, {
                    profile: options.profile,
                    allowDisabled: true,
                });
                const info = await activeCache.getInfo();
                reporter.renderCacheInfo(info);
            } catch (err) {
                console.error(pc.red('Error getting cache info:'), err);
                exitWithError();
            }
        });

    cacheCmd
        .command('path')
        .description('Print the resolved cache directory path')
        .option('-p, --profile <name>', 'Configuration profile used to resolve cache settings')
        .action(async (options: { profile?: string }) => {
            const activeCache = await resolveRuntimeCache(cache, {
                profile: options.profile,
                allowDisabled: true,
            });
            process.stdout.write(`${activeCache.getCachePath()}\n`);
        });
}

async function resolveRuntimeCache(
    fallbackCache: CacheContext,
    options: { profile?: string; allowDisabled?: boolean; cwd?: string } = {},
): Promise<CacheContext> {
    const cwd = options.cwd ?? process.cwd();

    try {
        const configResult = await resolveConfig({
            profile: options.profile,
            cache: fallbackCache,
            cwd,
        });

        if (!configResult.report.valid || !configResult.config) {
            return fallbackCache;
        }

        return createRuntimeCache(configResult.config, cwd, { allowDisabled: options.allowDisabled }) ?? fallbackCache;
    } catch {
        return fallbackCache;
    }
}
