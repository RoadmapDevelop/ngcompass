import cacache from 'cacache';
import v8 from 'node:v8';
import { AsyncDriver, DiskDriverConfig } from './types.js';

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
                const result = await cacache.get(cachePath, key);
                // cacache returns a Buffer. We deserialize it using V8.
                return v8.deserialize(result.data) as T;
            } catch (err: unknown) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const code = (err as any).code;

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
        }
    };
};
