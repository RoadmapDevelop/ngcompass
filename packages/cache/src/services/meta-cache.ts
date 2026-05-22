/**
 * @fileoverview
 * File-metadata cache.
 *
 * Stores `(mtime, size, contentHash)` for every source file so the scanner
 * can decide whether a file has actually changed without re-reading and
 * re-hashing it. Backed by `json-file.ts` so the data is durable across
 * runs and easy to inspect by hand during debugging.
 */

import type { AsyncDriver } from '../drivers/types.js';

/** Per-file metadata persisted between runs. */
export interface FileMeta {
    readonly mtime: number;
    readonly size: number;
    readonly hash: string;
}

/** Read/write surface exposed to consumers. */
export interface MetaCache {
    get: (filePath: string) => Promise<FileMeta | undefined>;
    set: (filePath: string, meta: FileMeta) => Promise<void>;
    delete: (filePath: string) => Promise<void>;
    /** Flushes any debounced disk writes; safe to await at process exit. */
    flush: () => Promise<void>;
}

/**
 * Wraps an async driver as a {@link MetaCache}. The driver may optionally
 * expose a `flush()` method which this wrapper forwards on demand.
 *
 * @param driver - Backing async driver (typically the JSON-file driver).
 * @returns A `MetaCache` proxy with a forwarding `flush()` method.
 */
export const createMetaCache = (driver: AsyncDriver<FileMeta>): MetaCache => ({
    get: (filePath) => driver.get(filePath),
    set: (filePath, meta) => driver.set(filePath, meta),
    delete: (filePath) => driver.delete(filePath),
    flush: async () => {
        const flushable = driver as { flush?: () => Promise<void> };
        if (typeof flushable.flush === 'function') {
            await flushable.flush();
        }
    },
});
