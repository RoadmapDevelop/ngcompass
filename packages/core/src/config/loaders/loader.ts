import { findAndLoadConfig, ConfigDiscoveryResult } from './discovery.js';
import { validateConfiguration } from '../health/index.js';
import { createDefaultContext } from '../health/context.js';
import type { ConfigValidationResult } from '@ngcompass/common';
import process from 'node:process';
import { ValidateConfigOptions } from '../actions/healthcheck.js';
import { CacheContext } from '../../cache/index.js';

/**
 * Resolves the configuration by searching, merging profiles, and performing full validation.
 */
export const resolveConfig = async (options: ValidateConfigOptions): Promise<ConfigValidationResult> => {
    const { cwd = process.cwd(), profile, cache } = options;

    const loaded = await findAndLoadConfig(cwd);

    // Cache Lookup
    const { hash, cachedResult } = await tryLoadFromCache(loaded, profile, cache);
    if (cachedResult) {
        return cachedResult;
    }

    // Validation
    const result = await runValidation(loaded, profile, cache);

    // Cache Persistence
    if (cache && hash) {
        await cache.configs.set(hash, result);
    }

    return result;
};

async function tryLoadFromCache(
    loaded: ConfigDiscoveryResult | null,
    profile: string | undefined,
    cache?: CacheContext
): Promise<{ hash?: string; cachedResult?: ConfigValidationResult }> {
    if (!cache) return {};

    // Hash includes content to catch layout changes (lines/columns), and profile
    const hashInput = JSON.stringify({
        contentHash: loaded?.contentHash,
        profile
        // Note: rawConfig isn't strictly needed if content is hashed, but might be safer if content is missing
    });

    const hash = cache.computeHash(hashInput);
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