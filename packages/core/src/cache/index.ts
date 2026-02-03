import path from 'path';
import { createMemoryDriver } from './drivers/memory.js';
import { createDiskDriver } from './drivers/disk.js';
import { createAtomicDriver } from './drivers/atomic.js';
import { createSourceCache, SourceCache, SourceEntry } from './services/source-cache.js';
import { createAstCache, AstCache, AstEntry } from './services/ast-cache.js';
import { createResultCache, ResultCache } from './services/result-cache.js';
import { createConfigCache, ConfigCache } from './services/config-cache.js';
import { CacheConfig } from './drivers/types.js';
import { computeCompositeHash } from './services/hashing.js';
import { CACHE_VERSION } from './constants.js';

export interface CacheInfo {
    ast: {
        l1: { entries: number; maxEntries: number; size: number };
        l2: { entries: number; size: number };
    };
    config: { entries: number; size: number };
    results: { entries: number; size: number };
    totalSize: number;
    location: string;
    version: string;
}

export interface CacheContext {
    sources: SourceCache;
    asts: AstCache;
    results: ResultCache;
    configs: ConfigCache;
    /**
     * Computes a hash suitable for caching keys
     */
    computeHash: (content: string, salt?: string) => string;
    /**
     * Clears old disk cache entries
     */
    prune: () => Promise<void>;
    /**
     * Clears all caches
     */
    clear: () => Promise<void>;
    /**
     * Clear specific cache type
     */
    clearType: (type: 'ast' | 'config' | 'results' | 'all') => Promise<void>;
    /**
     * Get cache statistics and info
     */
    getInfo: () => Promise<CacheInfo>;
    /**
     * Get absolute path to cache directory
     */
    getCachePath: () => string;
}

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

    // 2. Services
    const sources = createSourceCache(sourceDriver);
    const asts = createAstCache(astL1, astL2);
    const results = createResultCache(resultDriver);
    const configs = createConfigCache(configDriver);

    return {
        sources,
        asts,
        results,
        configs,
        computeHash: computeCompositeHash,
        prune: async () => {
            await astL2.prune();
        },
        clear: async () => {
            sourceDriver.clear();
            astL1.clear();
            await astL2.clear();
            await resultDriver.clear();
            await configDriver.clear();
        },
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
                    break;
                case 'all':
                    sourceDriver.clear();
                    astL1.clear();
                    await astL2.clear();
                    await resultDriver.clear();
                    await configDriver.clear();
                    break;
            }
        },
        getCachePath: () => defaultBaseDir,
        getInfo: async () => {
            const astL1Stats = astL1.getStats();
            const astL2Stats = await astL2.getStats(); // Async disk
            const configStats = await configDriver.getStats();
            const resultStats = await resultDriver.getStats();

            const totalSize = astL1Stats.size + astL2Stats.size + configStats.size + resultStats.size;

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

export * from './drivers/types.js';
export * from './services/source-cache.js';
export * from './services/ast-cache.js';
export * from './services/result-cache.js';
export * from './services/config-cache.js';
