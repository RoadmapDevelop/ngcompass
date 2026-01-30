import path from 'path';
import { createMemoryDriver } from './drivers/memory.js';
import { createDiskDriver } from './drivers/disk.js';
import { createAtomicDriver } from './drivers/atomic.js';
import { createSourceCache, SourceCache, SourceEntry } from './services/source-cache.js';
import { createAstCache, AstCache, AstEntry } from './services/ast-cache.js';
import { createResultCache, ResultCache } from './services/result-cache.js';
import { CacheConfig } from './drivers/types.js';
import { computeCompositeHash } from './services/hashing.js';

export interface CacheContext {
    sources: SourceCache;
    asts: AstCache;
    results: ResultCache;
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

    // Results: Atomic Files
    const resultDriver = createAtomicDriver<unknown>({
        path: path.join(config.disk?.path ?? defaultBaseDir, 'results')
    });

    // 2. Services
    const sources = createSourceCache(sourceDriver);
    const asts = createAstCache(astL1, astL2);
    const results = createResultCache(resultDriver);

    return {
        sources,
        asts,
        results,
        computeHash: computeCompositeHash,
        prune: async () => {
            await astL2.prune();
        },
        clear: async () => {
            sourceDriver.clear();
            astL1.clear();
            await astL2.clear();
            await resultDriver.clear();
        }
    };
};

export * from './drivers/types.js';
export * from './services/source-cache.js';
export * from './services/ast-cache.js';
export * from './services/result-cache.js';
