/**
 * @fileoverview
 * Public type surface for `@ngcompass/cache`.
 *
 * Re-exports the service interfaces and the aggregate {@link CacheContext}
 * shape that consumers depend on. Service implementations live in
 * `./services/*` but only their interfaces are exposed here so callers
 * cannot reach into private implementation details.
 */

import type { SourceCache } from './services/source-cache.js';
import type { AstCache } from './services/ast-cache.js';
import type { ResultCache } from './services/result-cache.js';
import type { ConfigCache } from './services/config-cache.js';
import type { MetaCache } from './services/meta-cache.js';
import type { PlanCache } from './services/plan-cache.js';
import type { FileCache } from './services/file-cache.js';

export type { SourceCache, AstCache, ResultCache, ConfigCache, MetaCache, PlanCache, FileCache };
export type { FileCacheEntry } from './services/file-cache.js';
export type { FileMeta } from './services/meta-cache.js';

/** Aggregate statistics returned by `CacheContext.getInfo()`. */
export interface CacheInfo {
    ast: {
        l1: { entries: number; maxEntries: number; size: number };
        l2: { entries: number; size: number };
    };
    config: { entries: number; size: number };
    results: { entries: number; size: number };
    /** Sum of every backing driver's reported size, in bytes. */
    totalSize: number;
    /** Absolute disk path of the cache root, or `[memory]` for memory-only contexts. */
    location: string;
    /** Tool-level cache version embedded in every key. */
    version: string;
}

/**
 * Aggregate cache facade returned by `createCacheContext`.
 *
 * Consumers receive the seven typed sub-caches plus lifecycle helpers
 * (`prune`, `clear`, `clearType`, `flush`, `getInfo`, `getCachePath`) and a
 * single `computeHash` helper that bakes the cache-key prefix into every
 * digest.
 */
export interface CacheContext {
    sources: SourceCache;
    asts: AstCache;
    results: ResultCache;
    configs: ConfigCache;
    metas: MetaCache;
    plans: PlanCache;
    files: FileCache;
    /** Full analysis-result cache keyed by global hash (warm-run short-circuit). */
    analysis: ResultCache;
    /** Computes a salted hash suitable for cache keys. */
    computeHash: (content: string, salt?: string) => string;
    /** Drops old or unreferenced disk-cache entries (driver-dependent). */
    prune: () => Promise<void>;
    /** Clears every backing driver. */
    clear: () => Promise<void>;
    /** Clears a specific cache family. */
    clearType: (type: 'ast' | 'config' | 'results' | 'all') => Promise<void>;
    /** Returns aggregate cache statistics. */
    getInfo: () => Promise<CacheInfo>;
    /** Absolute path to the cache directory (or `[memory]` for memory-only). */
    getCachePath: () => string;
    /** Flushes pending writes; call this before process exit to avoid data loss. */
    flush: () => Promise<void>;
}
