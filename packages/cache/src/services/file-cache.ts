/**
 * @fileoverview
 * Scanner-output cache.
 *
 * Stores the file list discovered by `@ngcompass/scanner` along with an
 * opaque `stats` blob describing the inputs that produced it. The scanner
 * uses this to skip rediscovery when neither the include/exclude globs nor
 * the project file list have changed since the last run.
 */

import type { AsyncDriver } from '../drivers/types.js';

/** Cached scanner output. */
export interface FileCacheEntry {
    /** Absolute paths of every file discovered. */
    files: string[];
    /** Wall-clock time of the discovery, in epoch milliseconds. */
    timestamp: number;
    /** Opaque scanner-input fingerprint; the scanner re-validates it. */
    stats?: unknown;
}

/** Read/write surface exposed to consumers. */
export interface FileCache {
    get: (key: string) => Promise<FileCacheEntry | undefined>;
    set: (key: string, files: string[], stats?: unknown) => Promise<void>;
}

/**
 * Wraps an async driver as a {@link FileCache}, stamping the timestamp on
 * every write.
 *
 * @param driver - Backing async driver (typically the disk driver).
 * @returns A `FileCache` proxy that owns the timestamp.
 */
export const createFileCache = (driver: AsyncDriver<FileCacheEntry>): FileCache => ({
    get: (key) => driver.get(key),
    set: (key, files, stats) => driver.set(key, { files, stats, timestamp: Date.now() }),
});
