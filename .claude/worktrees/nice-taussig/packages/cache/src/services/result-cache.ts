import { AsyncDriver } from '../drivers/types.js';
import { debug } from '@ngcompass/common';

/**
 * Cache metadata for tracking usage and freshness
 */
export interface CacheMetadata {
    /** Task ID (content hash) */
    readonly taskId: string;
    /** When result was cached */
    readonly timestamp: number;
    /** Number of cache hits */
    readonly hits: number;
    /** Last access time (for LRU) */
    readonly lastAccess: number;
}

/**
 * Cache entry with metadata
 */
export interface CacheEntry<T> {
    /** The cached result */
    readonly result: T;
    /** Cache metadata */
    readonly metadata: CacheMetadata;
}

/**
 * Result Cache interface with bulk operations for Phase 2.0
 */
export interface ResultCache {
    // Single operations (existing)
    get: <T>(hash: string) => Promise<T | undefined>;
    set: <T>(hash: string, result: T) => Promise<void>;
    has: (hash: string) => Promise<boolean>;
    delete: (hash: string) => Promise<void>;

    // Bulk operations (Phase 2.0)
    getMany: <T>(hashes: ReadonlyArray<string>) => Promise<ReadonlyMap<string, T>>;
    setMany: <T>(entries: ReadonlyArray<readonly [string, T]>) => Promise<void>;
    hasMany: (hashes: ReadonlyArray<string>) => Promise<ReadonlySet<string>>;

    // Metadata operations (Phase 2.0)
    getWithMetadata: <T>(hash: string) => Promise<CacheEntry<T> | undefined>;
    getManyWithMetadata: <T>(hashes: ReadonlyArray<string>) => Promise<ReadonlyMap<string, CacheEntry<T>>>;
    updateMetadata: (hash: string, updates: Partial<CacheMetadata>) => Promise<void>;
}

/**
 * Creates a Result Cache with bulk operations and metadata tracking.
 * Strategy: Distributed Files (One file per result).
 * Key: Content Hash (taskId).
 *
 * Phase 2.0: Enhanced with:
 * - Bulk operations (getMany, setMany, hasMany)
 * - Metadata tracking (hits, timestamp, lastAccess)
 * - Cache warmth analysis
 */
/**
 * Maximum number of result entries to read/write in a single parallel batch.
 * Sized to stay well within typical OS per-process file-descriptor limits (~1024)
 * while keeping batch overhead low. Benchmarked at 200 on ext4 and APFS.
 */
const RESULT_BATCH_SIZE = 200;

/**
 * Maximum number of metadata entries to write in a single parallel batch.
 * Kept lower than RESULT_BATCH_SIZE because metadata writes are paired with
 * result reads — running both at 200 would double the concurrent fd usage.
 */
const METADATA_BATCH_SIZE = 100;

export const createResultCache = (driver: AsyncDriver<unknown>): ResultCache => {

    /**
     * Get metadata key for a task
     */
    const getMetadataKey = (hash: string): string => `${hash}.meta`;

    /**
     * Get or create metadata for a task
     */
    const getOrCreateMetadata = async (hash: string): Promise<CacheMetadata> => {
        const metaKey = getMetadataKey(hash);
        const existing = await driver.get(metaKey) as CacheMetadata | undefined;

        if (existing) {
            return existing;
        }

        const newMeta: CacheMetadata = {
            taskId: hash,
            timestamp: Date.now(),
            hits: 0,
            lastAccess: Date.now(),
        };

        await driver.set(metaKey, newMeta);
        return newMeta;
    };

    /**
     * Increment hit count and update last access
     */
    const incrementHits = async (hash: string): Promise<void> => {
        const meta = await getOrCreateMetadata(hash);
        const updated: CacheMetadata = {
            ...meta,
            hits: meta.hits + 1,
            lastAccess: Date.now(),
        };
        await driver.set(getMetadataKey(hash), updated);
    };

    return {
        // Single operations
        get: async <T>(hash: string): Promise<T | undefined> => {
            const result = await driver.get(hash) as T | undefined;
            if (result !== undefined) {
                // Track cache hit (fire and forget)
                incrementHits(hash).catch(err => {
                    debug('cache', `incrementHits failed for ${hash}: ${err instanceof Error ? err.message : String(err)}`);
                });
            }
            return result;
        },

        set: async <T>(hash: string, result: T): Promise<void> => {
            await driver.set(hash, result);
            // Create initial metadata
            await getOrCreateMetadata(hash);
        },

        has: async (hash: string): Promise<boolean> => {
            return driver.has(hash);
        },

        delete: async (hash: string): Promise<void> => {
            await driver.delete(hash);
            try {
                await driver.delete(getMetadataKey(hash));
            } catch (error) {
                debug('cache', `Failed to delete metadata for ${hash}: ${error instanceof Error ? error.message : String(error)}`);
            }
        },

        // Bulk operations
        getMany: async <T>(hashes: ReadonlyArray<string>): Promise<ReadonlyMap<string, T>> => {
            if (hashes.length === 0) {
                return new Map<string, T>();
            }

            const results = new Map<string, T>();

            // Batched concurrency to avoid overwhelming OS with unbounded parallel I/O
            for (let i = 0; i < hashes.length; i += RESULT_BATCH_SIZE) {
                const batch = hashes.slice(i, i + RESULT_BATCH_SIZE);
                await Promise.all(
                    batch.map(async (hash) => {
                        const result = await driver.get(hash) as T | undefined;
                        if (result !== undefined) {
                            results.set(hash, result);
                            // Track hit (fire and forget)
                            incrementHits(hash).catch(err => {
                                debug('cache', `incrementHits failed for ${hash}: ${err instanceof Error ? err.message : String(err)}`);
                            });
                        }
                    })
                );
            }

            return results;
        },

        setMany: async <T>(entries: ReadonlyArray<readonly [string, T]>): Promise<void> => {
            if (entries.length === 0) return;

            // Batched concurrency to avoid overwhelming OS with unbounded parallel writes
            for (let i = 0; i < entries.length; i += METADATA_BATCH_SIZE) {
                const batch = entries.slice(i, i + METADATA_BATCH_SIZE);
                await Promise.all(
                    batch.map(async ([hash, result]) => {
                        await driver.set(hash, result);
                        await getOrCreateMetadata(hash);
                    })
                );
            }
        },

        hasMany: async (hashes: ReadonlyArray<string>): Promise<ReadonlySet<string>> => {
            // Short-circuit: nothing to check
            if (hashes.length === 0) {
                return new Set<string>();
            }

            // Short-circuit: if the cache directory is empty/missing, skip all 137K+ fs.access calls
            try {
                const stats = await driver.getStats();
                if (stats.entries === 0) {
                    return new Set<string>();
                }
            } catch {
                // If getStats fails (e.g. dir missing), cache is empty
                return new Set<string>();
            }

            const existing = new Set<string>();

            // Batched concurrency to avoid overwhelming the OS with unbounded parallel fs.access
            for (let i = 0; i < hashes.length; i += RESULT_BATCH_SIZE) {
                const batch = hashes.slice(i, i + RESULT_BATCH_SIZE);
                await Promise.all(
                    batch.map(async (hash) => {
                        const exists = await driver.has(hash);
                        if (exists) {
                            existing.add(hash);
                        }
                    })
                );
            }

            return existing;
        },

        // Metadata operations
        getWithMetadata: async <T>(hash: string): Promise<CacheEntry<T> | undefined> => {
            const result = await driver.get(hash) as T | undefined;
            if (result === undefined) {
                return undefined;
            }

            const metadata = await getOrCreateMetadata(hash);

            // Update access time
            await incrementHits(hash);

            return { result, metadata };
        },

        getManyWithMetadata: async <T>(hashes: ReadonlyArray<string>): Promise<ReadonlyMap<string, CacheEntry<T>>> => {
            if (hashes.length === 0) {
                return new Map<string, CacheEntry<T>>();
            }

            const entries = new Map<string, CacheEntry<T>>();
            const metadataUpdates: Array<[string, CacheMetadata]> = [];

            // Batched concurrency to avoid overwhelming OS with unbounded parallel I/O
            for (let i = 0; i < hashes.length; i += RESULT_BATCH_SIZE) {
                const batch = hashes.slice(i, i + RESULT_BATCH_SIZE);
                await Promise.all(
                    batch.map(async (hash) => {
                        const result = await driver.get(hash) as T | undefined;
                        if (result !== undefined) {
                            const metadata = await getOrCreateMetadata(hash);
                            const updated: CacheMetadata = {
                                ...metadata,
                                hits: metadata.hits + 1,
                                lastAccess: Date.now(),
                            };
                            entries.set(hash, { result, metadata: updated });
                            metadataUpdates.push([hash, updated]);
                        }
                    })
                );
            }

            // Batch update all metadata at once (non-blocking)
            if (metadataUpdates.length > 0) {
                for (let i = 0; i < metadataUpdates.length; i += METADATA_BATCH_SIZE) {
                    const batch = metadataUpdates.slice(i, i + METADATA_BATCH_SIZE);
                    await Promise.all(
                        batch.map(async ([hash, updated]) => {
                            await driver.set(getMetadataKey(hash), updated);
                        })
                    );
                }
            }

            return entries;
        },

        updateMetadata: async (hash: string, updates: Partial<CacheMetadata>): Promise<void> => {
            const existing = await driver.get(getMetadataKey(hash)) as CacheMetadata | undefined ?? await getOrCreateMetadata(hash);
            const updated: CacheMetadata = {
                ...existing,
                ...updates,
            };
            await driver.set(getMetadataKey(hash), updated);
        },
    };
};
