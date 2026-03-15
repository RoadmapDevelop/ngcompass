import fs from 'node:fs/promises';
import path from 'node:path';
import writeFileAtomic from 'write-file-atomic';
import { debug } from '@ngcompass/common';
import { AsyncDriver, DiskDriverConfig, DriverStats } from './types.js';

export const createJsonFileDriver = <T>(
    config: DiskDriverConfig
): AsyncDriver<T> & { flush: () => Promise<void> } => {
    const filePath = path.join(config.path, 'meta.json');
    const debounceMs = 2000;

    let cache: Map<string, T> | null = null;
    let loadPromise: Promise<void> | null = null;
    let saveTimeout: NodeJS.Timeout | null = null;
    let savePromise: Promise<void> | null = null;

    const load = async (): Promise<void> => {
        if (cache) return;
        if (loadPromise) return loadPromise;

        loadPromise = (async () => {
            try {
                await fs.mkdir(config.path, { recursive: true });
                const content = await fs.readFile(filePath, 'utf-8');
                const data = JSON.parse(content);
                if (data && typeof data === 'object') {
                    cache = new Map(Object.entries(data));
                } else {
                    cache = new Map();
                }
            } catch {
                cache = new Map();
            } finally {
                loadPromise = null;
            }
        })();

        return loadPromise;
    };

    const flush = async (): Promise<void> => {
        if (saveTimeout) {
            clearTimeout(saveTimeout);
            saveTimeout = null;
        }

        if (!cache) return;
        if (savePromise) await savePromise;

        savePromise = (async () => {
            try {
                await fs.mkdir(config.path, { recursive: true });
                const data = Object.fromEntries(cache);
                await writeFileAtomic(filePath, JSON.stringify(data));
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                debug('cache', `Failed to flush metadata cache to ${filePath}: ${msg}`);
            } finally {
                savePromise = null;
            }
        })();

        await savePromise;
    };

    const scheduleSave = () => {
        if (saveTimeout) return;
        saveTimeout = setTimeout(() => {
            saveTimeout = null;
            void flush();
        }, debounceMs);
        saveTimeout.unref();
    };

    return {
        get: async (key: string): Promise<T | undefined> => {
            await load();
            return cache!.get(key);
        },
        set: async (key: string, value: T): Promise<void> => {
            await load();
            cache!.set(key, value);
            scheduleSave();
        },
        has: async (key: string): Promise<boolean> => {
            await load();
            return cache!.has(key);
        },
        delete: async (key: string): Promise<void> => {
            await load();
            if (cache!.delete(key)) {
                scheduleSave();
            }
        },
        clear: async (): Promise<void> => {
            if (saveTimeout) {
                clearTimeout(saveTimeout);
                saveTimeout = null;
            }
            cache = new Map();
            try {
                await fs.unlink(filePath);
            } catch {
                // Ignore
            }
        },
        getStats: async (): Promise<DriverStats> => {
            await load();
            return {
                entries: cache!.size,
                size: 0
            };
        },
        flush
    };
};
