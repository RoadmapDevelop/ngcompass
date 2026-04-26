import { LRUCache } from 'lru-cache';
import { MemoryDriverConfig, SyncDriver } from './types.js';

/**
 * Creates a synchronous memory storage driver backed by LRU Cache.
 */
export const createMemoryDriver = <T>(
    config: MemoryDriverConfig = {}
): SyncDriver<T> => {
    const cache = new LRUCache<string, any>({
        max: config.maxItems ?? 500,
        maxSize: config.maxSize ?? 50 * 1024 * 1024, // Default 50MB
        sizeCalculation: (value) => {
            // Rough estimate using JSON length. Fast enough for writes.
            try {
                return JSON.stringify(value).length;
            } catch {
                return 1000; // Fallback for circular/non-serializable
            }
        },
        ttl: config.ttl,
    });

    return {
        get: (key: string): T | undefined => cache.get(key) as T | undefined,

        set: (key: string, value: T): void => {
            cache.set(key, value);
        },

        has: (key: string): boolean => cache.has(key),

        delete: (key: string): void => {
            cache.delete(key);
        },

        clear: (): void => cache.clear(),

        getStats: () => ({
            entries: cache.size,
            size: cache.calculatedSize
        }),
    };
};
