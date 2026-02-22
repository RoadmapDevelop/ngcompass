import { SourceCache } from './services/source-cache.js';
import { AstCache } from './services/ast-cache.js';
import { ResultCache } from './services/result-cache.js';
import { ConfigCache } from './services/config-cache.js';
import { MetaCache } from './services/meta-cache.js';
import { PlanCache } from './services/plan-cache.js';
import { FileCache } from './services/file-cache.js';

export type { SourceCache, AstCache, ResultCache, ConfigCache, MetaCache, PlanCache, FileCache };
export type { FileMeta } from './services/meta-cache.js';

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
    metas: MetaCache;
    plans: PlanCache;
    files: FileCache;
    /**
     * Stores full analysis results keyed by global hash (for warm run short-circuiting)
     */
    analysis: ResultCache;
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
