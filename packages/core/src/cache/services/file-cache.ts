import { AsyncDriver } from '../drivers/types.js';

export interface FileCacheEntry {
    files: string[];
    timestamp: number;
}

export interface FileCache {
    get: (key: string) => Promise<FileCacheEntry | undefined>;
    set: (key: string, files: string[]) => Promise<void>;
}

export const createFileCache = (driver: AsyncDriver<FileCacheEntry>): FileCache => {
    return {
        get: (key) => driver.get(key),
        set: (key, files) => driver.set(key, { files, timestamp: Date.now() })
    };
};
