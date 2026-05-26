import { CacheContext, createRuntimeCache } from '@ngcompass/cache';
import { Command } from 'commander';
import { getCacheReporter } from '@ngcompass/reporters';
import { resolveConfig } from '@ngcompass/config';
import pc from 'picocolors';
import process from 'node:process';
import { exitWithError, printError } from './exit.js';

type CacheClearType = 'ast' | 'config' | 'results' | 'all';
const CACHE_CLEAR_TYPES: readonly CacheClearType[] = [
  'ast',
  'config',
  'results',
  'all',
];
const CACHE_CLEAR_TYPE_VALUES = new Set<string>(CACHE_CLEAR_TYPES);

const isCacheClearType = (value: string): value is CacheClearType => {
  return CACHE_CLEAR_TYPE_VALUES.has(value);
};

function parseCacheClearType(value: string): CacheClearType {
  if (isCacheClearType(value)) {
    return value;
  }

  printError(
    `Invalid cache type: ${value}. Must be one of: ${CACHE_CLEAR_TYPES.join(', ')}`
  );
  return exitWithError();
}

export function registerCacheCommand(
  program: Command,
  cache: CacheContext
): void {
  const cacheCmd = program
    .command('cache')
    .description('Inspect and manage analysis cache data');

  cacheCmd
    .command('clear')
    .description('Clear cached data for one cache type or all cache types')
    .option(
      '-p, --profile <name>',
      'Configuration profile used to resolve cache settings'
    )
    .option(
      '--type <type>',
      'Cache type to clear: ast | config | results | all',
      'all'
    )
    .action(async (options: { type: string; profile?: string }) => {
      const type = parseCacheClearType(options.type);

      const reporter = getCacheReporter();
      process.stdout.write(pc.dim('  › Clearing cache...\n'));

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
        printError('Error clearing cache', err);
        exitWithError();
      }
    });

  cacheCmd
    .command('info')
    .description('Show cache status, size, and usage details')
    .option(
      '-p, --profile <name>',
      'Configuration profile used to resolve cache settings'
    )
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
        printError('Error getting cache info', err);
        exitWithError();
      }
    });

  cacheCmd
    .command('path')
    .description('Print the resolved cache directory path')
    .option(
      '-p, --profile <name>',
      'Configuration profile used to resolve cache settings'
    )
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
  options: { profile?: string; allowDisabled?: boolean; cwd?: string } = {}
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

    return (
      createRuntimeCache(configResult.config, cwd, {
        allowDisabled: options.allowDisabled,
      }) ?? fallbackCache
    );
  } catch (error: unknown) {
    printError(
      'Unable to resolve cache configuration; using default cache',
      error
    );
    return fallbackCache;
  }
}
