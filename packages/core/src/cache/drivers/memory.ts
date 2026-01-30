import { LRUCache } from 'lru-cache';
import { MemoryDriverConfig, SyncDriver } from './types.js';

/**
 * Creates a synchronous memory storage driver backed by LRU Cache.
 */
export const createMemoryDriver = <T>(
    config: MemoryDriverConfig = {}
): SyncDriver<T> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cache = new LRUCache<string, any>({
        max: config.maxItems ?? 500,
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
    };
};
