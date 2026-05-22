/**
 * @fileoverview
 * Source-file cache: holds raw file content keyed by content hash.
 *
 * The cache is memory-only because source bytes are read frequently during
 * analysis (rules, locators, snippet rendering) and the working set is
 * bounded by the file list. Disk persistence would add latency without
 * meaningful benefit since the source files themselves are on disk.
 */

import type { SyncDriver } from '../drivers/types.js';

/** Entry stored in the source cache. */
export interface SourceEntry {
    /** Raw file content (UTF-8). */
    content: string;
    /** Absolute file path the content was read from. */
    filePath: string;
}

/** Read/write surface exposed to consumers. */
export interface SourceCache {
    get: (hash: string) => SourceEntry | undefined;
    set: (hash: string, entry: SourceEntry) => void;
    has: (hash: string) => boolean;
}

/**
 * Wraps a synchronous driver as a {@link SourceCache}.
 *
 * @param driver - Backing synchronous driver (typically the memory driver).
 * @returns A `SourceCache` proxy over the driver.
 */
export const createSourceCache = (driver: SyncDriver<SourceEntry>): SourceCache => ({
    get: (hash) => driver.get(hash),
    set: (hash, entry) => driver.set(hash, entry),
    has: (hash) => driver.has(hash),
});
