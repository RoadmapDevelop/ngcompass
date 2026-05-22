/**
 * @fileoverview
 * Cache-key context.
 *
 * Encapsulates every version-tied input that affects cache validity so the
 * planner and config loader can mix them into their respective cache keys.
 * Must be included in EVERY cache key — otherwise an upgrade can keep
 * serving stale per-task results even when the plan-level cache rotates.
 *
 * Exact key formulas:
 *
 *   Config key:
 *     SHA-256(contentHash + "::" + profile + "::" + serializeCacheKeyContext(ctx))
 *
 *   Global hash (plan + analysis cache key):
 *     hash(sortedFilePairs + "||" + rulesHash + "||||" + serializeCacheKeyContext(ctx))
 *
 *   Task ID (result cache key):
 *     hash(ctx.toolVersion + "::" + ctx.ruleRegistryHash + "::" + ruleName + "::" + inputs...)
 */

import { createRequire } from 'node:module';
import { PACKAGE_VERSION, CACHE_VERSION, stableSerialize } from '@ngcompass/common';
import { computeHash } from './hashing.js';

// ============================================================
// INTERFACE
// ============================================================

export interface CacheKeyContext {
    /**
     * The ngcompass package version (e.g. "1.2.3").
     * Bumped on every release → invalidates all caches on upgrade.
     */
    readonly toolVersion: string;

    /**
     * The cache schema version (CACHE_VERSION constant).
     * Bumped when the serialization format of cached values changes.
     */
    readonly schemaVersion: string;

    /**
     * A hash of all registered rule names + versions.
     * Changes when a rule is added, removed, or its plugin is updated.
     */
    readonly ruleRegistryHash: string;

    /**
     * The oxc-parser version, if detectable; "unknown" otherwise.
     * Changes when the parser is upgraded, ensuring AST-dependent caches
     * are invalidated even if tool version is unchanged.
     */
    readonly parserVersion: string;

    /**
     * The OS platform string (e.g. "linux", "darwin", "win32").
     * Prevents cross-platform cache sharing where path separators or
     * binary outputs differ.
     */
    readonly platform: string;
}

// ============================================================
// FACTORY
// ============================================================

/**
 * Builds a CacheKeyContext from the current runtime environment and
 * the registered rule names.
 *
 * Call this ONCE per process, after all plugins are loaded and all rules
 * are registered. Pass the resulting context to buildExecutionPlan() and
 * resolveConfig().
 *
 * @param ruleNames - All registered rule names (from RuleRegistry)
 */
export function buildCacheKeyContext(
    ruleNames: ReadonlyArray<string>
): CacheKeyContext {
    const sortedNames = [...ruleNames].sort();
    const ruleRegistryHash = computeHash(stableSerialize(sortedNames));

    return Object.freeze<CacheKeyContext>({
        toolVersion: PACKAGE_VERSION,
        schemaVersion: CACHE_VERSION,
        ruleRegistryHash,
        parserVersion: resolveParserVersion(),
        platform: process.platform,
    });
}

// ============================================================
// SERIALIZATION
// ============================================================

/**
 * Serializes the context to a stable string for embedding in cache keys.
 *
 * Format: "toolVersion::schemaVersion::parserVersion::ruleRegistryHash::platform"
 *
 * All components are separated by "::" which cannot appear in the individual
 * values (version strings and hashes use only alphanumeric characters, dots,
 * and hyphens).
 */
export function serializeCacheKeyContext(ctx: CacheKeyContext): string {
    return [
        ctx.toolVersion,
        ctx.schemaVersion,
        ctx.parserVersion,
        ctx.ruleRegistryHash,
        ctx.platform,
    ].join('::');
}

// ============================================================
// INTERNAL HELPERS
// ============================================================

/**
 * Attempts to read the oxc-parser version from its package.json.
 * Returns "unknown" if the package is not resolvable.
 */
function resolveParserVersion(): string {
    try {
        const require = createRequire(import.meta.url);
        const pkg = require('oxc-parser/package.json') as { version?: string };
        return String(pkg.version ?? 'unknown');
    } catch {
        return 'unknown';
    }
}
