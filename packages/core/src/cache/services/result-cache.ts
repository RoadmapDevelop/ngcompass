import { AsyncDriver } from '../drivers/types.js';

export interface ResultCache {
    get: <T>(hash: string) => Promise<T | undefined>;
    set: <T>(hash: string, result: T) => Promise<void>;
}

/**
 * Creates a Result Cache.
 * Strategy: Distributed Files (One file per result).
 * key: Content Hash.
 */
export const createResultCache = (driver: AsyncDriver<unknown>): ResultCache => {
    return {
        get: async <T>(hash: string): Promise<T | undefined> => {
            return driver.get(hash) as Promise<T | undefined>;
        },

        set: async <T>(hash: string, result: T): Promise<void> => {
            await driver.set(hash, result);
        }
    };
};
