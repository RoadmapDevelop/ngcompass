import type { CacheContext } from '@ngcompass/cache';
import {
  CACHE_VERSION,
  PACKAGE_VERSION,
  debug,
  time,
  timeEnd,
} from '@ngcompass/common';
import type { ConfigValidationResult } from '@ngcompass/common';

import { createDefaultContext } from '../health/context.js';
import { validateConfiguration } from '../health/validator.js';
import { findAndLoadConfig, type ConfigDiscoveryResult } from './discovery.js';

export interface ValidateConfigOptions {
  cwd: string;

  profile?: string;

  cache?: CacheContext;
}

export const resolveConfig = async (
  options: ValidateConfigOptions
): Promise<ConfigValidationResult> => {
  time('config-resolution');
  const { cwd, profile, cache } = options;

  debug(
    'loader',
    `Starting config resolution (cwd: ${cwd}, profile: ${profile || 'none'})`
  );

  const loaded = await findAndLoadConfig(cwd);

  const { hash, cachedResult } = await tryLoadFromCache(loaded, profile, cache);
  if (cachedResult) {
    const resolutionTime = timeEnd('config-resolution');
    debug(
      'loader',
      `Cache HIT - returning cached result (${resolutionTime.toFixed(1)}ms)`
    );
    return cachedResult;
  }
  debug('loader', 'Cache MISS - running validation');

  const result = await runValidation(loaded, profile, cache);
  debug(
    'loader',
    `Validation complete: ${result.report.valid ? 'valid' : `invalid (${result.report.issues.length} issues)`}`
  );

  if (cache && hash) {
    await cache.configs.set(hash, result);
    debug('loader', `Cached validation result: key=${hash.substring(0, 8)}...`);
  }

  const resolutionTime = timeEnd('config-resolution');
  debug('loader', `Config resolution complete: ${resolutionTime.toFixed(1)}ms`);

  return result;
};

async function tryLoadFromCache(
  loaded: ConfigDiscoveryResult | null,
  profile: string | undefined,
  cache?: CacheContext
): Promise<{ hash?: string; cachedResult?: ConfigValidationResult }> {
  if (!cache) return {};

  const hashInput = [
    loaded?.contentHash ?? '',
    profile ?? '',
    PACKAGE_VERSION,
    CACHE_VERSION,
  ].join('::');

  const hash = cache.computeHash(hashInput);
  debug('loader', `Cache lookup: key=${hash.substring(0, 8)}...`);

  const cachedResult = await cache.configs.get(hash);
  return { hash, cachedResult };
}

async function runValidation(
  loaded: ConfigDiscoveryResult | null,
  profile: string | undefined,
  cache?: CacheContext
): Promise<ConfigValidationResult> {
  const rawConfig = (loaded?.config ?? {}) as Record<string, unknown>;
  const context = createDefaultContext({ profile });

  return validateConfiguration(
    rawConfig,
    context,
    loaded?.filepath,
    loaded?.content,
    cache?.asts,
    loaded?.contentHash
  );
}
