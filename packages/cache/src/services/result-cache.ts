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

    // Write-behind flush
    flush: () => Promise<void>;
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
 * Maximum number of entries to write in a single parallel batch.
 * cacache manages its own fd pool, so we can safely match RESULT_BATCH_SIZE.
 */
const WRITE_BATCH_SIZE = 200;

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

    // ─── Write-behind buffer ────────────────────────────────────────────
    // Accumulates entries in memory during analysis; drains to disk on flush().
    const pendingWrites = new Map<string, unknown>();

    /**
     * Drain all pending writes to the driver.
     *
     * Fast path: if the driver supports bulkSet (e.g. PackedFileDriver), all
     * entries are serialized and written in a SINGLE I/O operation — O(1) writes
     * regardless of how many results are pending.
     *
     * Fallback: batched individual writes for drivers that don't support bulkSet
     * (e.g. the cacache-backed DiskDriver).
     */
    const drainPendingWrites = async (): Promise<void> => {
        if (pendingWrites.size === 0) return;

        const entries = [...pendingWrites.entries()];
        pendingWrites.clear();

        const now = Date.now();

        if (driver.bulkSet) {
            const all: Array<readonly [string, unknown]> = [];
            for (const [hash, result] of entries) {
                all.push([hash, result]);
                all.push([getMetadataKey(hash), {
                    taskId: hash,
                    timestamp: now,
                    hits: 0,
                    lastAccess: now,
                } satisfies CacheMetadata]);
            }
            await driver.bulkSet(all);
        } else {
            for (let i = 0; i < entries.length; i += WRITE_BATCH_SIZE) {
                const batch = entries.slice(i, i + WRITE_BATCH_SIZE);
                await Promise.all(batch.map(([hash, result]) => driver.set(hash, result)));
                await Promise.all(batch.map(([hash]) =>
                    driver.set(getMetadataKey(hash), {
                        taskId: hash,
                        timestamp: now,
                        hits: 0,
                        lastAccess: now,
                    } satisfies CacheMetadata)
                ));
            }
        }

        debug('cache', `Flushed ${entries.length} buffered results to disk`);
    };

    return {
        // Single operations
        get: async <T>(hash: string): Promise<T | undefined> => {
            // Check write-behind buffer first
            if (pendingWrites.has(hash)) {
                return pendingWrites.get(hash) as T;
            }

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
            if (pendingWrites.has(hash)) return true;
            return driver.has(hash);
        },

        delete: async (hash: string): Promise<void> => {
            pendingWrites.delete(hash);
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
                        // Check write-behind buffer first
                        if (pendingWrites.has(hash)) {
                            results.set(hash, pendingWrites.get(hash) as T);
                            return;
                        }

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

            // Buffer entries in memory — actual disk I/O deferred to flush()
            for (const [hash, result] of entries) {
                pendingWrites.set(hash, result);
            }

            debug('cache', `Buffered ${entries.length} results (total pending: ${pendingWrites.size})`);
        },

        hasMany: async (hashes: ReadonlyArray<string>): Promise<ReadonlySet<string>> => {
            // Short-circuit: nothing to check
            if (hashes.length === 0) {
                return new Set<string>();
            }

            // Short-circuit: if the cache directory is empty/missing, skip all fs.access calls
            const hasPending = hashes.some(h => pendingWrites.has(h));
            if (!hasPending) {
                try {
                    const stats = await driver.getStats();
                    if (stats.entries === 0) {
                        return new Set<string>();
                    }
                } catch {
                    // If getStats fails (e.g. dir missing), cache is empty
                    return new Set<string>();
                }
            }

            const existing = new Set<string>();

            // Batched concurrency to avoid overwhelming the OS with unbounded parallel fs.access
            for (let i = 0; i < hashes.length; i += RESULT_BATCH_SIZE) {
                const batch = hashes.slice(i, i + RESULT_BATCH_SIZE);
                await Promise.all(
                    batch.map(async (hash) => {
                        if (pendingWrites.has(hash)) {
                            existing.add(hash);
                            return;
                        }
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
            const result = (pendingWrites.has(hash)
                ? pendingWrites.get(hash)
                : await driver.get(hash)) as T | undefined;

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
                        const result = (pendingWrites.has(hash)
                            ? pendingWrites.get(hash)
                            : await driver.get(hash)) as T | undefined;

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

            // Batch update all metadata at once
            if (metadataUpdates.length > 0) {
                for (let i = 0; i < metadataUpdates.length; i += WRITE_BATCH_SIZE) {
                    const batch = metadataUpdates.slice(i, i + WRITE_BATCH_SIZE);
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

        flush: drainPendingWrites,
    };
};
