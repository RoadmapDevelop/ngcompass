import path from 'path';
import { createMemoryDriver } from './drivers/memory.js';
import { createDiskDriver } from './drivers/disk.js';
import { createPackedFileDriver } from './drivers/packed.js';
import { createAtomicDriver } from './drivers/atomic.js';
import { createJsonFileDriver } from './drivers/json-file.js';
import { createSourceCache, SourceEntry } from './services/source-cache.js';
import { createAstCache, AstEntry } from './services/ast-cache.js';
import { createResultCache } from './services/result-cache.js';
import { createConfigCache } from './services/config-cache.js';
import { createMetaCache, FileMeta } from './services/meta-cache.js';
import { createPlanCache } from './services/plan-cache.js';
import { createFileCache, FileCacheEntry } from './services/file-cache.js';
import { CacheConfig } from './drivers/types.js';
import { computeCompositeHash } from './services/hashing.js';
import { CACHE_VERSION } from './constants.js';
import { CacheContext } from './types.js';
import { AsyncDriver, DriverStats } from './drivers/types.js';

const createAsyncMemoryDriver = <T>(maxItems?: number, ttl?: number): AsyncDriver<T> => {
    const driver = createMemoryDriver<T>({ maxItems, ttl });

    return {
        get: async (key: string): Promise<T | undefined> => driver.get(key),
        set: async (key: string, value: T): Promise<void> => {
            driver.set(key, value);
        },
        has: async (key: string): Promise<boolean> => driver.has(key),
        delete: async (key: string): Promise<void> => {
            driver.delete(key);
        },
        clear: async (): Promise<void> => {
            driver.clear();
        },
        getStats: async (): Promise<DriverStats> => driver.getStats(),
    };
};

/**
 * Initializes the caching system.
 */
export const createCacheContext = (config: CacheConfig = {}): CacheContext => {
    const cwd = process.cwd();
    const defaultBaseDir = path.resolve(cwd, 'node_modules', '.cache', 'ngcompass');
    const useMemoryOnly = !config.disk?.path;
    const cacheLocation = config.disk?.path ?? '[memory]';

    // 1. Drivers
    // Sources: Memory Only
    const sourceDriver = createMemoryDriver<SourceEntry>({
        maxItems: config.memory?.maxItems
    });

    // ASTs: Tiered (Memory + Disk)
    const astL1 = createMemoryDriver<AstEntry>({
        maxItems: 200 // Keep top 200 ASTs in memory
    });

    const astL2 = useMemoryOnly
        ? createAsyncMemoryDriver<AstEntry>(config.memory?.maxItems, config.memory?.ttl)
        : createDiskDriver<AstEntry>({
            path: path.join(config.disk?.path ?? defaultBaseDir, 'ast'),
            ttl: config.disk?.ttl
        });

    const resultDriver = useMemoryOnly
        ? createAsyncMemoryDriver<unknown>(config.memory?.maxItems, config.memory?.ttl)
        : createPackedFileDriver<unknown>({
            path: path.join(config.disk?.path ?? defaultBaseDir, 'results'),
        });

    const configDriver = useMemoryOnly
        ? createAsyncMemoryDriver<unknown>(config.memory?.maxItems, config.memory?.ttl)
        : createAtomicDriver<unknown>({
            path: path.join(config.disk?.path ?? defaultBaseDir, 'config')
        });

    const metaDriver = useMemoryOnly
        ? createAsyncMemoryDriver<FileMeta>(config.memory?.maxItems, config.memory?.ttl)
        : createJsonFileDriver<FileMeta>({
            path: path.join(config.disk?.path ?? defaultBaseDir, 'meta')
        });

    const planDriver = useMemoryOnly
        ? createAsyncMemoryDriver<unknown>(config.memory?.maxItems, config.memory?.ttl)
        : createDiskDriver<unknown>({
            path: path.join(config.disk?.path ?? defaultBaseDir, 'plans'),
            ttl: config.disk?.ttl,
        });

    const fileDriver = useMemoryOnly
        ? createAsyncMemoryDriver<FileCacheEntry>(config.memory?.maxItems, config.memory?.ttl)
        : createDiskDriver<FileCacheEntry>({
            path: path.join(config.disk?.path ?? defaultBaseDir, 'files'),
            ttl: config.disk?.ttl,
        });

    // 2. Services
    const sources = createSourceCache(sourceDriver);
    const asts = createAstCache(astL1, astL2);
    const results = createResultCache(resultDriver);
    const configs = createConfigCache(configDriver);
    const metas = createMetaCache(metaDriver);
    const plans = createPlanCache(planDriver);
    const files = createFileCache(fileDriver);

    // Analysis results cache (disk driver, keyed by global hash)
    const analysisDriver = useMemoryOnly
        ? createAsyncMemoryDriver<unknown>(config.memory?.maxItems, config.memory?.ttl)
        : createDiskDriver<unknown>({
            path: path.join(config.disk?.path ?? defaultBaseDir, 'analysis'),
            ttl: config.disk?.ttl,
        });
    const analysis = createResultCache(analysisDriver);

    // Shared helper: clear every driver — single source of truth for "clear all".
    const clearAllDrivers = async (): Promise<void> => {
        sourceDriver.clear();
        astL1.clear();
        await astL2.clear();
        await resultDriver.clear();
        await configDriver.clear();
        await metaDriver.clear();
        await planDriver.clear();
        await fileDriver.clear();
        await analysisDriver.clear();
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
        computeHash: computeCompositeHash,
        prune: async () => {
            if ('prune' in astL2 && typeof astL2.prune === 'function') {
                await astL2.prune();
            }
        },
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
                    await resultDriver.clear();
                    await analysisDriver.clear();
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
                astL1Stats.size +
                astL2Stats.size +
                configStats.size +
                resultStats.size +
                metaStats.size +
                planStats.size +
                fileStats.size +
                analysisStats.size;

            return {
                ast: {
                    l1: { entries: astL1Stats.entries, maxEntries: 200, size: astL1Stats.size },
                    l2: { entries: astL2Stats.entries, size: astL2Stats.size }
                },
                config: { entries: configStats.entries, size: configStats.size },
                results: { entries: resultStats.entries, size: resultStats.size },
                totalSize,
                location: cacheLocation,
                version: CACHE_VERSION
            };
        }
    };
};

let globalCache: CacheContext | null = null;

/**
 * Returns a globally shared cache context.
 * Useful for CLI and long-running processes to avoid redundant initializations.
 */
export const getCacheContext = (config?: CacheConfig): CacheContext => {
    if (!globalCache) {
        globalCache = createCacheContext(config);
    }
    return globalCache;
};

/**
 * Resets the global cache singleton to null.
 * Call this in tests between runs to get a clean slate without restarting the process.
 */
export const resetGlobalCache = (): void => {
    globalCache = null;
};
