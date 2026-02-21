import { findAndLoadConfig, ConfigDiscoveryResult } from './discovery.js';
import { validateConfiguration } from '../health/index.js';
import { createDefaultContext } from '../health/context.js';
import type { ConfigValidationResult } from '@ngcompass/common';
import { PACKAGE_VERSION, CACHE_VERSION } from '@ngcompass/common';
import process from 'node:process';
import { ValidateConfigOptions } from '../actions/healthcheck.js';
import { CacheContext } from '../../cache/index.js';
import { debug, time, timeEnd } from '@ngcompass/common';

/**
 * Resolves the configuration by searching, merging profiles, and performing full validation.
 *
 * Cache key formula (RFC §7.1):
 *   key = computeHash(
 *     contentHash                  // SHA-1 of raw config file bytes — catches any content change
 *     + "::" + (profile ?? "")    // profile name (empty string for default)
 *     + "::" + toolVersion        // package version — invalidates on tool upgrade
 *     + "::" + schemaVersion      // CACHE_VERSION — invalidates on schema change
 *   )
 */
export const resolveConfig = async (options: ValidateConfigOptions): Promise<ConfigValidationResult> => {
    time('config-resolution');
    const { cwd = process.cwd(), profile, cache } = options;

    debug('loader', `Starting config resolution (cwd: ${cwd}, profile: ${profile || 'none'})`);

    const loaded = await findAndLoadConfig(cwd);

    // Cache Lookup
    const { hash, cachedResult } = await tryLoadFromCache(loaded, profile, cache);
    if (cachedResult) {
        const resolutionTime = timeEnd('config-resolution');
        debug('loader', `Cache HIT - returning cached result (${resolutionTime.toFixed(1)}ms)`);
        return cachedResult;
    }

    debug('loader', 'Cache MISS - running validation');

    // Validation
    const result = await runValidation(loaded, profile, cache);

    debug('loader', `Validation complete: ${result.report.valid ? 'valid' : `invalid (${result.report.issues.length} issues)`}`);

    // Cache Persistence
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

    // RFC §7.1: Cache key includes content hash, profile, tool version, and schema version.
    // This guarantees that upgrading the tool or changing the config schema automatically
    // invalidates the cached validation result — no manual cache clearing required.
    const hashInput = [
        loaded?.contentHash ?? '',
        profile ?? '',
        PACKAGE_VERSION,   // tool version — bumped on every release
        CACHE_VERSION,     // schema version — bumped when cached shape changes
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
