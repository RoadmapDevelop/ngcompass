/**
 * @fileoverview
 * Cache-context factory.
 *
 * `createCacheContext` is the single entry point that wires the seven cache
 * services (sources, ASTs, results, configs, metas, plans, files) and the
 * separate analysis cache to their backing drivers. The factory is the only
 * module that knows which driver each service uses; everything else
 * receives an opaque `CacheContext`.
 *
 * The factory accepts a fully-resolved disk path from the caller — it never
 * calls `process.cwd()` itself, so library callers retain control over file
 * locations. The CLI's `createRuntimeCache` is responsible for translating
 * user configuration into the resolved path passed in here.
 */

import path from 'node:path';
import process from 'node:process';
import { createAtomicDriver } from './drivers/atomic.js';
import { createDiskDriver } from './drivers/disk.js';
import { createJsonFileDriver } from './drivers/json-file.js';
import { createMemoryDriver } from './drivers/memory.js';
import { createPackedFileDriver } from './drivers/packed.js';
import type { AsyncDriver, CacheConfig, DriverStats } from './drivers/types.js';
import { CACHE_KEY_PREFIX, CACHE_VERSION } from './constants.js';
import { computeCompositeHash } from './services/hashing.js';
import { createAstCache, type AstEntry } from './services/ast-cache.js';
import { createConfigCache } from './services/config-cache.js';
import { createFileCache, type FileCacheEntry } from './services/file-cache.js';
import { createMetaCache, type FileMeta } from './services/meta-cache.js';
import { createPlanCache } from './services/plan-cache.js';
import { createResultCache } from './services/result-cache.js';
import { createSourceCache, type SourceEntry } from './services/source-cache.js';
import type { CacheContext } from './types.js';
import type { ConfigValidationResult } from '@ngcompass/common';

/** Maximum number of AST entries held in the L1 (memory) tier. */
const AST_L1_MAX_ENTRIES = 200;

/** Subdirectory names under the cache root. */
const SUBDIR = {
    ast: 'ast',
    results: 'results',
    config: 'config',
    meta: 'meta',
    plans: 'plans',
    files: 'files',
    analysis: 'analysis',
} as const;

/** Sentinel value reported by `getCachePath()` when no disk path is configured. */
const MEMORY_LOCATION = '[memory]';

/**
 * Promotes a synchronous memory driver to the async driver contract so it
 * can stand in for disk drivers when no disk path is configured.
 */
const createAsyncMemoryDriver = <T>(maxItems?: number, ttl?: number): AsyncDriver<T> => {
    const driver = createMemoryDriver<T>({ maxItems, ttl });
    return {
        get: async (key) => driver.get(key),
        set: async (key, value) => { driver.set(key, value); },
        has: async (key) => driver.has(key),
        delete: async (key) => { driver.delete(key); },
        clear: async () => { driver.clear(); },
        getStats: async (): Promise<DriverStats> => driver.getStats(),
    };
};

/**
 * Resolves the cache root for the given configuration.
 *
 * Returns the configured disk path verbatim when supplied; otherwise falls
 * back to a project-local default rooted at `process.cwd()`. The fallback
 * is only consulted in tests and ad-hoc tooling — production callers (CLI
 * and library API) always pass a resolved `disk.path`.
 */
const resolveDiskRoot = (config: CacheConfig): string => {
    if (config.disk?.path) return config.disk.path;
    return path.resolve(process.cwd(), 'node_modules', '.cache', 'ngcompass');
};

/**
 * Builds a fully wired {@link CacheContext} from the supplied driver
 * configuration.
 *
 * @param config - Memory/disk driver configuration; both branches are optional.
 * @returns A `CacheContext` with every service ready for use.
 */
export const createCacheContext = (config: CacheConfig = {}): CacheContext => {
    const useMemoryOnly = !config.disk?.path;
    const diskRoot = useMemoryOnly ? MEMORY_LOCATION : resolveDiskRoot(config);
    const cacheLocation = useMemoryOnly ? MEMORY_LOCATION : diskRoot;
    const diskTtl = config.disk?.ttl;
    const memTtl = config.memory?.ttl;
    const memMax = config.memory?.maxItems;

    // ── Drivers ────────────────────────────────────────────────────────────
    const sourceDriver = createMemoryDriver<SourceEntry>({ maxItems: memMax });
    const astL1 = createMemoryDriver<AstEntry>({ maxItems: AST_L1_MAX_ENTRIES });

    const astL2 = useMemoryOnly
        ? createAsyncMemoryDriver<AstEntry>(memMax, memTtl)
        : createDiskDriver<AstEntry>({ path: path.join(diskRoot, SUBDIR.ast), ttl: diskTtl });

    const resultDriver = useMemoryOnly
        ? createAsyncMemoryDriver<unknown>(memMax, memTtl)
        : createPackedFileDriver<unknown>({ path: path.join(diskRoot, SUBDIR.results) });

    const configDriver = useMemoryOnly
        ? createAsyncMemoryDriver<ConfigValidationResult>(memMax, memTtl)
        : createAtomicDriver<ConfigValidationResult>({ path: path.join(diskRoot, SUBDIR.config) });

    const metaDriver = useMemoryOnly
        ? createAsyncMemoryDriver<FileMeta>(memMax, memTtl)
        : createJsonFileDriver<FileMeta>({ path: path.join(diskRoot, SUBDIR.meta) });

    const planDriver = useMemoryOnly
        ? createAsyncMemoryDriver<unknown>(memMax, memTtl)
        : createDiskDriver<unknown>({ path: path.join(diskRoot, SUBDIR.plans), ttl: diskTtl });

    const fileDriver = useMemoryOnly
        ? createAsyncMemoryDriver<FileCacheEntry>(memMax, memTtl)
        : createDiskDriver<FileCacheEntry>({ path: path.join(diskRoot, SUBDIR.files), ttl: diskTtl });

    const analysisDriver = useMemoryOnly
        ? createAsyncMemoryDriver<unknown>(memMax, memTtl)
        : createDiskDriver<unknown>({ path: path.join(diskRoot, SUBDIR.analysis), ttl: diskTtl });

    // ── Services ───────────────────────────────────────────────────────────
    const sources = createSourceCache(sourceDriver);
    const asts = createAstCache(astL1, astL2);
    const results = createResultCache(resultDriver);
    const configs = createConfigCache(configDriver);
    const metas = createMetaCache(metaDriver);
    const plans = createPlanCache(planDriver);
    const files = createFileCache(fileDriver);
    const analysis = createResultCache(analysisDriver);

    /** Clears every backing driver. Single source of truth for "clear all". */
    const clearAllDrivers = async (): Promise<void> => {
        sourceDriver.clear();
        astL1.clear();
        await Promise.all([
            astL2.clear(),
            resultDriver.clear(),
            configDriver.clear(),
            metaDriver.clear(),
            planDriver.clear(),
            fileDriver.clear(),
            analysisDriver.clear(),
        ]);
    };

    /** Runs cacache verification on the L2 AST driver when it supports it. */
    const prune = async (): Promise<void> => {
        const prunable = astL2 as { prune?: () => Promise<void> };
        if (typeof prunable.prune === 'function') {
            await prunable.prune();
        }
    };

    return {
        sources,
        asts,
        results,
        configs,
        metas,
        plans,
        files,
        analysis,
        computeHash: (content, salt) => computeCompositeHash(content, salt ?? CACHE_KEY_PREFIX),
        prune,
        clear: clearAllDrivers,
        clearType: async (type) => {
            switch (type) {
                case 'ast':
                    astL1.clear();
                    await astL2.clear();
                    break;
                case 'config':
                    await configDriver.clear();
                    break;
                case 'results':
                    await Promise.all([resultDriver.clear(), analysisDriver.clear()]);
                    break;
                case 'all':
                    await clearAllDrivers();
                    break;
            }
        },
        flush: async () => {
            await Promise.all([
                results.flush(),
                analysis.flush(),
                metas.flush(),
            ]);
        },
        getCachePath: () => cacheLocation,
        getInfo: async () => {
            const astL1Stats = astL1.getStats();
            const [
                astL2Stats,
                configStats,
                resultStats,
                metaStats,
                planStats,
                fileStats,
                analysisStats,
            ] = await Promise.all([
                astL2.getStats(),
                configDriver.getStats(),
                resultDriver.getStats(),
                metaDriver.getStats(),
                planDriver.getStats(),
                fileDriver.getStats(),
                analysisDriver.getStats(),
            ]);

            const totalSize =
                astL1Stats.size + astL2Stats.size + configStats.size +
                resultStats.size + metaStats.size + planStats.size +
                fileStats.size + analysisStats.size;

            return {
                ast: {
                    l1: { entries: astL1Stats.entries, maxEntries: AST_L1_MAX_ENTRIES, size: astL1Stats.size },
                    l2: { entries: astL2Stats.entries, size: astL2Stats.size },
                },
                config: { entries: configStats.entries, size: configStats.size },
                results: { entries: resultStats.entries, size: resultStats.size },
                totalSize,
                location: cacheLocation,
                version: CACHE_VERSION,
            };
        },
    };
};

// ── Process-global singleton ───────────────────────────────────────────────

let globalCache: CacheContext | null = null;

/**
 * Returns the process-wide cache context, lazily constructing it on first
 * call. Useful for CLI commands and long-running scripts that want to share
 * a single cache across calls.
 *
 * @param config - Driver configuration; ignored after the singleton exists.
 */
export const getCacheContext = (config?: CacheConfig): CacheContext => {
    if (!globalCache) {
        globalCache = createCacheContext(config);
    }
    return globalCache;
};

/**
 * Resets the process-wide cache singleton. Tests call this between cases to
 * get a clean slate without restarting the process.
 */
export const resetGlobalCache = (): void => {
    globalCache = null;
};
