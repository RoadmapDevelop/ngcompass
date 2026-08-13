import path from 'node:path';
import type { NormalizedAnalyzerConfig } from '@ngcompass/common';
import { createCacheContext } from './context.js';
import type {
  CacheContext,
  CreateRuntimeCacheOptions,
} from './models/index.js';

export function createRuntimeCache(
  config: NormalizedAnalyzerConfig,
  cwd: string,
  options: CreateRuntimeCacheOptions = {}
): CacheContext | undefined {
  if (!config.cache.enabled && !options.allowDisabled) {
    return undefined;
  }

  const useMemory = config.cache.strategy === 'memory';

  return createCacheContext({
    memory: useMemory ? { ttl: config.cache.ttl } : undefined,
    disk: useMemory
      ? undefined
      : {
          path: path.resolve(cwd, config.cache.location),
          ttl: config.cache.ttl,
        },
  });
}
