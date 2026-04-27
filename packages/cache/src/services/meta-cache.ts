import { AsyncDriver } from '../drivers/types.js';

export interface FileMeta {
    readonly mtime: number;
    readonly size: number;
    readonly hash: string;
}

export interface MetaCache {
    get: (filePath: string) => Promise<FileMeta | undefined>;
    set: (filePath: string, meta: FileMeta) => Promise<void>;
    delete: (filePath: string) => Promise<void>;
    flush: () => Promise<void>;
}

/**
 * Creates a File Meta Cache.
 * Stores file stats (mtime, size) and their computed content hashes.
 * Strategy: Persistent Disk Storage.
 * Key: Absolute File Path.
 */
export const createMetaCache = (driver: AsyncDriver<FileMeta>): MetaCache => {
    return {
        get: (filePath) => driver.get(filePath),
        set: (filePath, meta) => driver.set(filePath, meta),
        delete: (filePath) => driver.delete(filePath),
        flush: async () => {
            const flushable = driver as { flush?: () => Promise<void> };
            if (typeof flushable.flush === 'function') {
                await flushable.flush();
            }
        }
    };
};
