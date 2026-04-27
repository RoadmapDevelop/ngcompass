import path from 'node:path';
import type { NormalizedAnalyzerConfig } from '@ngcompass/common';
import { createCacheContext } from './context.js';
import type { CacheContext } from './types.js';

export function createRuntimeCache(
    config: NormalizedAnalyzerConfig,
    cwd: string,
    options: { allowDisabled?: boolean } = {},
): CacheContext | undefined {
    if (!config.cache.enabled && !options.allowDisabled) {
        return undefined;
    }

    const cachePath = path.resolve(cwd, config.cache.location);
    return createCacheContext({
        memory: config.cache.strategy === 'memory'
            ? { ttl: config.cache.ttl }
            : undefined,
        disk: config.cache.strategy === 'memory'
            ? undefined
            : {
                path: cachePath,
                ttl: config.cache.ttl,
            },
    });
}
