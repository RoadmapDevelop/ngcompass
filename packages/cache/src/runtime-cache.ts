/**
 * @fileoverview
 * CLI-facing helper that translates the user-facing cache configuration
 * (`NormalizedAnalyzerConfig.cache`) into a {@link CacheContext}.
 *
 * Centralizing the translation here keeps the lower-level
 * `createCacheContext` factory unaware of the analyzer config schema and
 * frees library callers from worrying about disabled-cache semantics.
 */

import path from 'node:path';
import type { NormalizedAnalyzerConfig } from '@ngcompass/common';
import { createCacheContext } from './context.js';
import type { CacheContext } from './types.js';

/** Options accepted by {@link createRuntimeCache}. */
export interface CreateRuntimeCacheOptions {
    /** When `true`, build a context even if `config.cache.enabled` is `false`. */
    allowDisabled?: boolean;
}

/**
 * Builds a runtime {@link CacheContext} from the validated analyzer config.
 *
 * @param config        - Normalized analyzer configuration.
 * @param cwd           - Project root used to resolve relative cache paths.
 * @param options       - Optional behavior flags (see {@link CreateRuntimeCacheOptions}).
 * @returns A `CacheContext` ready for use, or `undefined` when the cache is
 *          disabled and the caller did not request `allowDisabled`.
 */
export function createRuntimeCache(
    config: NormalizedAnalyzerConfig,
    cwd: string,
    options: CreateRuntimeCacheOptions = {},
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
