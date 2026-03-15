import path from 'path';
import { createMemoryDriver } from './drivers/memory.js';
import { createDiskDriver } from './drivers/disk.js';
import { createAtomicDriver } from './drivers/atomic.js';
import { createJsonFileDriver } from './drivers/json-file.js';
import { createSourceCache, SourceEntry } from './services/source-cache.js';
import { createAstCache, AstEntry } from './services/ast-cache.js';
import { createResultCache } from './services/result-cache.js';
import { createConfigCache } from './services/config-cache.js';
import { createMetaCache, FileMeta } from './services/meta-cache.js';
import { createPlanCache } from './services/plan-cache.js';
import { createFileCache } from './services/file-cache.js';
import { CacheConfig } from './drivers/types.js';
import { computeCompositeHash } from './services/hashing.js';
import { CACHE_VERSION } from './constants.js';
import { CacheContext } from './types.js';

/**
 * Initializes the caching system.
 */
export const createCacheContext = (config: CacheConfig = {}): CacheContext => {
    const cwd = process.cwd();
    const defaultBaseDir = path.resolve(cwd, 'node_modules', '.cache', 'ngcompass');

    // 1. Drivers
    // Sources: Memory Only
    const sourceDriver = createMemoryDriver<SourceEntry>({
        maxItems: config.memory?.maxItems
    });

    // ASTs: Tiered (Memory + Disk)
    const astL1 = createMemoryDriver<AstEntry>({
        maxItems: 200 // Keep top 200 ASTs in memory
    });

    const astL2 = createDiskDriver<AstEntry>({
        path: path.join(config.disk?.path ?? defaultBaseDir, 'ast'),
        ttl: config.disk?.ttl
    });

    const resultDriver = createAtomicDriver<unknown>({
        path: path.join(config.disk?.path ?? defaultBaseDir, 'results')
    });

    const configDriver = createAtomicDriver<any>({
        path: path.join(config.disk?.path ?? defaultBaseDir, 'config')
    });

    const metaDriver = createJsonFileDriver<FileMeta>({
        path: path.join(config.disk?.path ?? defaultBaseDir, 'meta')
    });

    // Use regular disk driver for plan cache
    const planDriver = createDiskDriver<any>({
        path: path.join(config.disk?.path ?? defaultBaseDir, 'plans'),
    });

    const fileDriver = createDiskDriver<any>({
        path: path.join(config.disk?.path ?? defaultBaseDir, 'files'),
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
    const analysisDriver = createDiskDriver<unknown>({
        path: path.join(config.disk?.path ?? defaultBaseDir, 'analysis')
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
            await astL2.prune();
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
            await metaDriver.flush();
        },
        getCachePath: () => config.disk?.path ?? defaultBaseDir,
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
                location: config.disk?.path ?? defaultBaseDir,
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
