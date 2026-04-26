import cacache from 'cacache';
import v8 from 'node:v8';
import { AsyncDriver, DiskDriverConfig } from './types.js';
import { getDirectoryStats } from '../utils/fs.js';

/**
 * Creates an asynchronous disk storage driver backed by cacache.
 * Uses V8 serialization for high-performance binary storage.
 * Includes resilience against deserialization errors (Try-Catch-Delete).
 */
export const createDiskDriver = <T>(
    config: DiskDriverConfig
): AsyncDriver<T> & { prune: () => Promise<void> } => {
    const cachePath = config.path;

    return {
        get: async (key: string): Promise<T | undefined> => {
            try {
                const tReadStart = performance.now();
                const result = await cacache.get(cachePath, key);
                const tReadEnd = performance.now();

                const tDeserStart = performance.now();
                const deserialized = v8.deserialize(result.data) as T;
                const tDeserEnd = performance.now();

                // Optional: debug logging for cache driver timing
                if (process.env.DEBUG_CACHE) {
                    process.stdout.write(
                        `[disk-driver] read: ${(tReadEnd - tReadStart).toFixed(2)}ms, deser: ${(tDeserEnd - tDeserStart).toFixed(2)}ms, size: ${(result.data.length / 1024).toFixed(1)}KB\n`
                    );
                }

                return deserialized;
            } catch (err: unknown) {
                const code = typeof err === 'object' && err !== null && 'code' in err ? (err as { code: unknown }).code : undefined;

                if (code === 'ENOENT') {
                    return undefined; // Not found
                }

                // Defensive: If deserialization fails (corruption, version mismatch), 
                // delete the entry to self-heal.
                try {
                    await cacache.rm.entry(cachePath, key);
                } catch {
                    // Ignore delete errors
                }
                return undefined;
            }
        },

        set: async (key: string, value: T): Promise<void> => {
            // Serialize to Buffer using V8
            const buffer = v8.serialize(value);
            await cacache.put(cachePath, key, buffer);
        },

        has: async (key: string): Promise<boolean> => {
            try {
                const info = await cacache.get.info(cachePath, key);
                return !!info;
            } catch {
                return false;
            }
        },

        delete: async (key: string): Promise<void> => {
            await cacache.rm.entry(cachePath, key);
        },

        clear: async (): Promise<void> => {
            await cacache.rm.all(cachePath);
        },

        prune: async (): Promise<void> => {
            // cleans up old/unused entries
            await cacache.verify(cachePath);
        },

        getStats: async () => {
            // cacache stores content in content-addressable blobs.
            // Counting entries is hard without listing keys.
            // Ideally we'd use cacache.ls() but that's slow.
            // For "size", getting the folder size is accurate enough for user consumption.
            return getDirectoryStats(cachePath);
        }
    };
};
