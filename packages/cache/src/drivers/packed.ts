import fs from 'node:fs/promises';
import v8 from 'node:v8';
import path from 'node:path';
import { AsyncDriver, DriverStats } from './types.js';

/**
 * A single-file cache driver that stores all entries in one v8-serialized pack.
 *
 * Compared to cacache (one file per entry), this driver does ONE file write on
 * flush regardless of how many entries are pending — eliminating the N-file write
 * bottleneck that causes a visible delay after analysis completes.
 *
 * Trade-off: the pack file is read entirely into memory on first access.
 * For result caches this is acceptable (~2–10 MB for typical projects).
 */
export const createPackedFileDriver = <T>(config: { path: string }): AsyncDriver<T> & {
    bulkSet(entries: ReadonlyArray<readonly [string, T]>): Promise<void>;
} => {
    const filePath = config.path + '.pack';
    const map = new Map<string, T>();
    let loaded = false;

    const ensureLoaded = async (): Promise<void> => {
        if (loaded) return;
        loaded = true;
        try {
            const buf = await fs.readFile(filePath);
            const restored = v8.deserialize(buf) as Map<string, T>;
            for (const [k, v] of restored) map.set(k, v);
        } catch {
            // File doesn't exist yet — start empty
        }
    };

    const save = async (): Promise<void> => {
        const dir = path.dirname(filePath);
        await fs.mkdir(dir, { recursive: true });
        const buf = v8.serialize(map);
        const tmp = filePath + '.tmp';
        await fs.writeFile(tmp, buf);
        await fs.rename(tmp, filePath);
    };

    return {
        get: async (key: string): Promise<T | undefined> => {
            await ensureLoaded();
            return map.get(key);
        },

        set: async (key: string, value: T): Promise<void> => {
            await ensureLoaded();
            map.set(key, value);
            await save();
        },

        has: async (key: string): Promise<boolean> => {
            await ensureLoaded();
            return map.has(key);
        },

        delete: async (key: string): Promise<void> => {
            await ensureLoaded();
            map.delete(key);
            await save();
        },

        clear: async (): Promise<void> => {
            map.clear();
            loaded = true;
            try { await fs.unlink(filePath); } catch { /* already gone */ }
            try { await fs.unlink(filePath + '.tmp'); } catch { /* ignore */ }
        },

        getStats: async (): Promise<DriverStats> => {
            await ensureLoaded();
            let size = 0;
            try {
                const stat = await fs.stat(filePath);
                size = stat.size;
            } catch { /* file not written yet */ }
            return { entries: map.size, size };
        },

        /**
         * Write many entries in a single I/O operation.
         * This is the primary fast path used by drainPendingWrites.
         */
        bulkSet: async (entries: ReadonlyArray<readonly [string, T]>): Promise<void> => {
            await ensureLoaded();
            for (const [k, v] of entries) map.set(k, v);
            await save();
        },
    };
};
