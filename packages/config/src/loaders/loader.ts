/**
 * @fileoverview
 * Composes discovery, caching, and validation into the public `resolveConfig`
 * entry point.
 *
 * Cache key formula (RFC §7.1):
 *   key = computeHash(
 *     contentHash                  // SHA-1 of raw config file bytes — catches any content change
 *     + "::" + (profile ?? "")    // profile name (empty string for default)
 *     + "::" + toolVersion        // package version — invalidates on tool upgrade
 *     + "::" + schemaVersion      // CACHE_VERSION — invalidates on schema change
 *   )
 *
 * On a cache hit we return the persisted result verbatim. On a miss the raw
 * config is fed through the full validation pipeline and persisted back.
 */

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

/**
 * Options accepted by {@link resolveConfig} and the public `validateConfig`
 * action wrapper. Declared here (not in `actions/`) so the type lives next to
 * its primary consumer; the action wrapper imports it from this module.
 */
export interface ValidateConfigOptions {
    /** Working directory used as the search root for discovery. */
    cwd: string;
    /** Optional profile name to merge before validation. */
    profile?: string;
    /** Optional cache context used to short-circuit repeated resolutions. */
    cache?: CacheContext;
}

/**
 * Resolves the active configuration by searching, merging profiles, and
 * running full semantic validation. Persists the validated result keyed by
 * content + profile + tool/schema version.
 *
 * @param options - Discovery root, profile, and optional cache context.
 * @returns {Promise<ConfigValidationResult>} Resolved config and issue report.
 */
export const resolveConfig = async (
    options: ValidateConfigOptions,
): Promise<ConfigValidationResult> => {
    time('config-resolution');
    const { cwd, profile, cache } = options;

    debug('loader', `Starting config resolution (cwd: ${cwd}, profile: ${profile || 'none'})`);

    const loaded = await findAndLoadConfig(cwd);

    const { hash, cachedResult } = await tryLoadFromCache(loaded, profile, cache);
    if (cachedResult) {
        const resolutionTime = timeEnd('config-resolution');
        debug('loader', `Cache HIT - returning cached result (${resolutionTime.toFixed(1)}ms)`);
        return cachedResult;
    }
    debug('loader', 'Cache MISS - running validation');

    const result = await runValidation(loaded, profile, cache);
    debug('loader', `Validation complete: ${result.report.valid ? 'valid' : `invalid (${result.report.issues.length} issues)`}`);

    if (cache && hash) {
        await cache.configs.set(hash, result);
        debug('loader', `Cached validation result: key=${hash.substring(0, 8)}...`);
    }

    const resolutionTime = timeEnd('config-resolution');
    debug('loader', `Config resolution complete: ${resolutionTime.toFixed(1)}ms`);

    return result;
};

/**
 * Computes the cache key and probes the configs cache for a prior result.
 *
 * @returns Object with the computed hash (if a cache was supplied) and the
 *          cached `ConfigValidationResult` when a hit occurs.
 */
async function tryLoadFromCache(
    loaded: ConfigDiscoveryResult | null,
    profile: string | undefined,
    cache?: CacheContext,
): Promise<{ hash?: string; cachedResult?: ConfigValidationResult }> {
    if (!cache) return {};

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

/**
 * Runs the validation pipeline on the discovered (or empty) configuration.
 */
async function runValidation(
    loaded: ConfigDiscoveryResult | null,
    profile: string | undefined,
    cache?: CacheContext,
): Promise<ConfigValidationResult> {
    const rawConfig = (loaded?.config ?? {}) as Record<string, unknown>;
    const context = createDefaultContext({ profile });

    return validateConfiguration(
        rawConfig,
        context,
        loaded?.filepath,
        loaded?.content,
        cache?.asts,
        loaded?.contentHash,
    );
}
