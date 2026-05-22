/**
 * @fileoverview
 * Synchronous in-memory storage driver backed by `lru-cache`.
 *
 * The size estimator avoids `JSON.stringify` on the hot path — every `set`
 * on a deep object would otherwise traverse the whole graph. Instead we
 * estimate based on `typeof` so the calculator is constant-time per entry.
 * Eviction quality is unchanged for the typical workload (results, ASTs,
 * source strings) because LRU only needs a monotonically reasonable size.
 */

import { LRUCache } from 'lru-cache';
import type { MemoryDriverConfig, SyncDriver } from './types.js';

/** Fallback size estimate (bytes) for non-string, non-buffer entries. */
const FALLBACK_ENTRY_SIZE = 1024;

/** Maximum approximate memory budget when none is configured. */
const DEFAULT_MAX_SIZE_BYTES = 50 * 1024 * 1024;

/** Default LRU capacity in entries when none is configured. */
const DEFAULT_MAX_ITEMS = 500;

/**
 * Cheap, allocation-free size estimator. Strings count their UTF-16 length
 * directly; buffers use their byte length; everything else returns a
 * constant. Keeps `set` O(1) instead of O(entry-size).
 */
const estimateSize = (value: unknown): number => {
    if (typeof value === 'string') return value.length;
    if (value instanceof Uint8Array) return value.byteLength;
    return FALLBACK_ENTRY_SIZE;
};

/**
 * Builds a synchronous LRU-backed memory driver.
 *
 * @param config - Memory driver configuration (max entries, max bytes, TTL).
 * @returns A {@link SyncDriver} bound to a private `LRUCache` instance.
 */
export const createMemoryDriver = <T>(config: MemoryDriverConfig = {}): SyncDriver<T> => {
    // LRUCache v10+ requires `V extends {}` (i.e. non-nullish). Cache values
    // are always concrete in our usage; cast through `object` rather than
    // through `any` so the constraint is documented at exactly one site.
    const cache = new LRUCache<string, T & object>({
        max: config.maxItems ?? DEFAULT_MAX_ITEMS,
        maxSize: config.maxSize ?? DEFAULT_MAX_SIZE_BYTES,
        sizeCalculation: estimateSize,
        ttl: config.ttl,
    });

    return {
        get: (key) => cache.get(key) as T | undefined,
        set: (key, value) => { cache.set(key, value as T & object); },
        has: (key) => cache.has(key),
        delete: (key) => { cache.delete(key); },
        clear: () => { cache.clear(); },
        getStats: () => ({
            entries: cache.size,
            size: cache.calculatedSize,
        }),
    };
};
