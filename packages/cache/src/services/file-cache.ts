import { AsyncDriver } from '../drivers/types.js';

export interface FileCacheEntry {
    files: string[];
    timestamp: number;
    stats?: unknown;
}

export interface FileCache {
    get: (key: string) => Promise<FileCacheEntry | undefined>;
    set: (key: string, files: string[], stats?: unknown) => Promise<void>;
}

export const createFileCache = (driver: AsyncDriver<FileCacheEntry>): FileCache => {
    return {
        get: (key) => driver.get(key),
        set: (key, files, stats) => driver.set(key, { files, stats, timestamp: Date.now() })
    };
};
