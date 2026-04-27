import writeFileAtomic from 'write-file-atomic';
import fs from 'node:fs/promises';
import path from 'node:path';
import { AsyncDriver, DiskDriverConfig } from './types.js';
import { getDirectoryStats } from '../utils/fs.js';

/**
 * Creates a storage driver that writes each key as a separate file.
 * Uses write-file-atomic for safe writes.
 *
 * Performance Optimization (P0):
 * Maintains an in-memory "Directory Catalog" to avoid thousands of fs.access calls.
 * - initialized lazily via fs.readdir
 * - maintained in-sync on set/delete/clear
 *
 * Concurrency Safety:
 * - coalesces concurrent catalog builds
 * - guards catalog writes with a monotonic generation to avoid clear()/readdir() races
 * - ensures set/delete update catalog correctly even while initialization is in-flight
 */
export const createAtomicDriver = <T>(config: DiskDriverConfig): AsyncDriver<T> => {
    const cacheDir = config.path;

    let catalog: Set<string> | null = null;
    let catalogPromise: Promise<void> | null = null;
    let catalogGeneration = 0;

    const getFilePath = (key: string): string => path.join(cacheDir, `${key}.json`);

    const ensureDir = async (): Promise<void> => {
        try {
            await fs.mkdir(cacheDir, { recursive: true });
        } catch {
            // Intentionally ignored (directory may already exist or be created concurrently).
        }
    };

    const listJsonKeys = (files: string[]): string[] =>
        files.filter(isJsonFile).map(stripJsonExtension);

    const isJsonFile = (fileName: string): boolean => fileName.endsWith('.json');

    const stripJsonExtension = (fileName: string): string => fileName.slice(0, -5);

    const safeReadDir = async (dir: string): Promise<string[]> => {
        try {
            return await fs.readdir(dir);
        } catch {
            // Intentionally returns empty list if directory does not exist or cannot be read.
            return [];
        }
    };

    const tryReadJsonFile = async (filePath: string): Promise<string | undefined> => {
        try {
            return await fs.readFile(filePath, 'utf-8');
        } catch {
            // Intentionally returns undefined when file cannot be read (missing, deleted, etc.).
            return undefined;
        }
    };

    const tryUnlink = async (filePath: string): Promise<void> => {
        try {
            await fs.unlink(filePath);
        } catch {
            // Intentionally ignored (file may not exist).
        }
    };

    const tryRemoveDir = async (dir: string): Promise<void> => {
        try {
            await fs.rm(dir, { recursive: true, force: true });
        } catch {
            // Intentionally ignored (directory may not exist).
        }
    };

    const markMissingInCatalog = (key: string): void => {
        if (catalog) catalog.delete(key);
    };

    const addToCatalog = (key: string): void => {
        if (catalog) catalog.add(key);
    };

    const removeFromCatalog = (key: string): void => {
        if (catalog) catalog.delete(key);
    };

    const resetCatalogEmpty = (): void => {
        catalog = new Set();
    };

    const awaitCatalogInitIfInFlight = async (): Promise<void> => {
        if (catalogPromise) {
            await catalogPromise;
        }
    };

    /**
     * Initializes the catalog if not already loaded.
     * Coalesces multiple concurrent calls into a single readdir.
     * Uses generation guard to avoid clear()/readdir() races.
     */
    const ensureCatalog = async (): Promise<void> => {
        if (catalog) return;

        if (!catalogPromise) {
            const localGeneration = catalogGeneration;

            catalogPromise = (async () => {
                try {
                    await ensureDir();
                    const files = await safeReadDir(cacheDir);
                    const keys = listJsonKeys(files);

                    // Only publish if generation hasn't changed (e.g., clear() happened).
                    if (catalogGeneration === localGeneration) {
                        catalog = new Set(keys);
                    }
                } finally {
                    // Always release the promise, even if errors occurred.
                    catalogPromise = null;

                    // Ensure catalog is never left null after initialization attempt.
                    if (!catalog) {
                        catalog = new Set();
                    }
                }
            })();
        }

        await catalogPromise;
    };

    const publishCatalogAfterClear = (): void => {
        catalogGeneration += 1;
        resetCatalogEmpty();
    };

    const syncCatalogAfterSet = async (key: string): Promise<void> => {
        await awaitCatalogInitIfInFlight();
        addToCatalog(key);
    };

    const syncCatalogAfterDelete = async (key: string): Promise<void> => {
        await awaitCatalogInitIfInFlight();
        removeFromCatalog(key);
    };

    return {
        get: async (key: string): Promise<T | undefined> => {
            // Intentionally avoids forcing catalog initialization for single reads.
            if (catalog && !catalog.has(key)) {
                return undefined;
            }

            const filePath = getFilePath(key);
            const data = await tryReadJsonFile(filePath);

            if (data === undefined) {
                markMissingInCatalog(key);
                return undefined;
            }

            try {
                return JSON.parse(data) as T;
            } catch {
                // Intentionally treats corrupt entries as cache misses and removes from catalog.
                markMissingInCatalog(key);
                return undefined;
            }
        },

        set: async (key: string, value: T): Promise<void> => {
            await ensureDir();
            const filePath = getFilePath(key);

            await writeFileAtomic(filePath, JSON.stringify(value), { encoding: 'utf-8' });

            if (catalog || catalogPromise) {
                await syncCatalogAfterSet(key);
            }
        },

        has: async (key: string): Promise<boolean> => {
            await ensureCatalog();
            return catalog!.has(key);
        },

        delete: async (key: string): Promise<void> => {
            await tryUnlink(getFilePath(key));

            if (catalog || catalogPromise) {
                await syncCatalogAfterDelete(key);
            }
        },

        clear: async (): Promise<void> => {
            await tryRemoveDir(cacheDir);
            await ensureDir();

            publishCatalogAfterClear();
        },

        getStats: async () => {
            return getDirectoryStats(cacheDir);
        },
    };
};
