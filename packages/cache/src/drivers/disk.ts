/**
 * @fileoverview
 * Asynchronous disk storage driver backed by `cacache`.
 *
 * Entries are V8-serialized for compact binary on-disk representation.
 * Deserialization errors (corruption, V8 format change after Node upgrade)
 * are treated as cache misses and the offending entry is silently removed
 * so subsequent reads do not keep hitting the same bad blob.
 *
 * Timing diagnostics flow through the shared `debug('cache', …)`
 * channel rather than `process.stdout`, so they respect the project-wide
 * stderr/`DEBUG` filtering and never appear in normal output.
 */

import v8 from 'node:v8';
import cacache from 'cacache';
import { debug } from '@ngcompass/common';
import { getDirectoryStats } from '../utils/fs.js';
import type { AsyncDriver, DiskDriverConfig } from './types.js';

/**
 * Returns the `code` property of a thrown value when it looks like a
 * `NodeJS.ErrnoException`, otherwise `undefined`.
 */
const errorCode = (err: unknown): string | undefined => {
    if (err && typeof err === 'object' && 'code' in err) {
        const code = (err as { code: unknown }).code;
        return typeof code === 'string' ? code : undefined;
    }
    return undefined;
};

/**
 * Builds an async disk driver that supports the standard CRUD interface plus
 * a `prune` operation that runs cacache's verification pass.
 */
export const createDiskDriver = <T>(
    config: DiskDriverConfig,
): AsyncDriver<T> & { prune: () => Promise<void> } => {
    const cachePath = config.path;

    return {
        get: async (key) => {
            try {
                const tReadStart = performance.now();
                const result = await cacache.get(cachePath, key);
                const tReadEnd = performance.now();

                const tDeserStart = performance.now();
                const deserialized = v8.deserialize(result.data) as T;
                const tDeserEnd = performance.now();

                debug(
                    'cache',
                    `read=${(tReadEnd - tReadStart).toFixed(2)}ms ` +
                    `deserialize=${(tDeserEnd - tDeserStart).toFixed(2)}ms ` +
                    `bytes=${result.data.length}`,
                );

                return deserialized;
            } catch (err) {
                if (errorCode(err) === 'ENOENT') return undefined;

                // Deserialization failed (corruption or V8 schema change).
                // Self-heal by dropping the entry; log so operators can see it.
                const message = err instanceof Error ? err.message : String(err);
                debug('cache', `Dropping unreadable entry ${key}: ${message}`);
                try {
                    await cacache.rm.entry(cachePath, key);
                } catch {
                    // The entry may already have been removed by a parallel get/clear.
                }
                return undefined;
            }
        },

        set: async (key, value) => {
            const buffer = v8.serialize(value);
            await cacache.put(cachePath, key, buffer);
        },

        has: async (key) => {
            try {
                const info = await cacache.get.info(cachePath, key);
                return Boolean(info);
            } catch {
                return false;
            }
        },

        delete: async (key) => {
            await cacache.rm.entry(cachePath, key);
        },

        clear: async () => {
            await cacache.rm.all(cachePath);
        },

        prune: async () => {
            // cacache.verify walks the content-addressable store, removes
            // unreferenced blobs, and compacts the index file.
            await cacache.verify(cachePath);
        },

        getStats: async () => {
            // Counting entries via cacache.ls() is O(n) and slow for large caches.
            // Folder-size statistics are accurate enough for user-facing reporting.
            return getDirectoryStats(cachePath);
        },
    };
};
