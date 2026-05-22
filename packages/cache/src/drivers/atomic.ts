/**
 * @fileoverview
 * One-file-per-key disk driver with atomic writes.
 *
 * Each cache entry is persisted to its own `<key>.json` file using
 * `write-file-atomic`. To avoid an `fs.access` syscall per `has()`, the
 * driver keeps an in-memory "directory catalog" (a `Set<string>` of known
 * keys) that is populated lazily on first use and kept in sync on every
 * mutating operation.
 *
 * Concurrency model:
 *  - Concurrent catalog builds are coalesced through `catalogPromise`.
 *  - A monotonic `catalogGeneration` counter discards catalog reads that
 *    were started before a `clear()` happened, preventing stale entries
 *    from re-appearing post-clear.
 *  - Mutations that arrive before catalog initialization completes wait on
 *    the in-flight build, then apply their delta on top.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import writeFileAtomic from 'write-file-atomic';
import { getDirectoryStats } from '../utils/fs.js';
import type { AsyncDriver, DiskDriverConfig } from './types.js';

const JSON_EXTENSION = '.json';

/**
 * Returns the `*.json` file names from `entries` (whether `entries` came
 * from `readdir` or a stale list), stripped of their extensions.
 */
const listJsonKeys = (entries: string[]): string[] =>
    entries
        .filter((name) => name.endsWith(JSON_EXTENSION))
        .map((name) => name.slice(0, -JSON_EXTENSION.length));

/** Wrapper around `fs.readdir` that returns `[]` instead of throwing. */
const safeReadDir = async (dir: string): Promise<string[]> => {
    try {
        return await fs.readdir(dir);
    } catch {
        return [];
    }
};

/** Wrapper around `fs.readFile` that returns `undefined` instead of throwing. */
const tryReadJsonFile = async (filePath: string): Promise<string | undefined> => {
    try {
        return await fs.readFile(filePath, 'utf-8');
    } catch {
        return undefined;
    }
};

/** Wrapper around `fs.unlink` that ignores ENOENT and similar. */
const tryUnlink = async (filePath: string): Promise<void> => {
    try {
        await fs.unlink(filePath);
    } catch {
        // File already gone.
    }
};

/**
 * Builds an atomic-write, one-file-per-key disk driver.
 *
 * @param config - Driver configuration (directory path).
 * @returns A fully-featured {@link AsyncDriver} for the given directory.
 */
export const createAtomicDriver = <T>(config: DiskDriverConfig): AsyncDriver<T> => {
    const cacheDir = config.path;
    const getFilePath = (key: string): string => path.join(cacheDir, `${key}${JSON_EXTENSION}`);

    let catalog: Set<string> | null = null;
    let catalogPromise: Promise<void> | null = null;
    let catalogGeneration = 0;

    const ensureDir = async (): Promise<void> => {
        try {
            await fs.mkdir(cacheDir, { recursive: true });
        } catch {
            // mkdir may race with a concurrent caller; either outcome is acceptable.
        }
    };

    /**
     * Lazily populates the catalog from disk. Coalesces concurrent calls and
     * discards the result if a `clear()` happened mid-flight.
     */
    const ensureCatalog = async (): Promise<void> => {
        if (catalog) return;
        if (!catalogPromise) {
            const localGeneration = catalogGeneration;
            catalogPromise = (async () => {
                try {
                    await ensureDir();
                    const files = await safeReadDir(cacheDir);
                    if (catalogGeneration === localGeneration) {
                        catalog = new Set(listJsonKeys(files));
                    }
                } finally {
                    catalogPromise = null;
                    if (!catalog) catalog = new Set();
                }
            })();
        }
        await catalogPromise;
    };

    /** Applies a key insertion to the catalog, awaiting any in-flight build first. */
    const syncCatalogInsert = async (key: string): Promise<void> => {
        if (catalogPromise) await catalogPromise;
        catalog?.add(key);
    };

    /** Applies a key deletion to the catalog, awaiting any in-flight build first. */
    const syncCatalogRemove = async (key: string): Promise<void> => {
        if (catalogPromise) await catalogPromise;
        catalog?.delete(key);
    };

    return {
        get: async (key) => {
            // Skip the catalog lookup on the read path — building it just for
            // a miss would defeat the optimization. If the catalog is already
            // built and reports a miss, trust it.
            if (catalog && !catalog.has(key)) return undefined;

            const filePath = getFilePath(key);
            const data = await tryReadJsonFile(filePath);
            if (data === undefined) {
                catalog?.delete(key);
                return undefined;
            }

            try {
                return JSON.parse(data) as T;
            } catch {
                catalog?.delete(key);
                return undefined;
            }
        },

        set: async (key, value) => {
            await ensureDir();
            await writeFileAtomic(getFilePath(key), JSON.stringify(value), { encoding: 'utf-8' });
            if (catalog || catalogPromise) {
                await syncCatalogInsert(key);
            }
        },

        has: async (key) => {
            await ensureCatalog();
            return catalog?.has(key) ?? false;
        },

        delete: async (key) => {
            await tryUnlink(getFilePath(key));
            if (catalog || catalogPromise) {
                await syncCatalogRemove(key);
            }
        },

        clear: async () => {
            try {
                await fs.rm(cacheDir, { recursive: true, force: true });
            } catch {
                // Directory may not exist; ignore.
            }
            await ensureDir();
            catalogGeneration += 1;
            catalog = new Set();
        },

        getStats: async () => getDirectoryStats(cacheDir),
    };
};
