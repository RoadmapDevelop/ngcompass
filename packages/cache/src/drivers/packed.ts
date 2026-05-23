/**
 * @fileoverview
 * Single-file pack driver: all entries are V8-serialized into one `.pack`
 * file on disk.
 *
 * Compared to cacache (which writes one file per entry) this driver performs
 * O(1) disk writes per flush regardless of how many entries are pending,
 * eliminating the N-file bottleneck visible after a large analysis run.
 *
 * Trade-off: the pack is held entirely in memory after first access. This
 * is acceptable for the result cache (~2–10 MB on typical projects) but
 * unsuitable for AST caches that can grow into the hundreds of megabytes.
 *
 * The primary fast path is {@link AsyncDriver.bulkSet}. The single-entry
 * `set()` still re-serializes and writes the whole pack — use the buffered
 * upstream path (`ResultCache.setMany` → `flush`) for high-volume writes.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import v8 from 'node:v8';
import writeFileAtomic from 'write-file-atomic';
import type { AsyncDriver, DriverStats } from './types.js';

const PACK_SUFFIX = '.pack';

/**
 * Builds a packed-file driver bound to `config.path` (the `.pack` suffix is
 * appended automatically).
 *
 * @param config - Driver configuration; only `path` is used.
 * @returns An {@link AsyncDriver} with a required `bulkSet` method.
 */
export const createPackedFileDriver = <T>(config: { path: string }): AsyncDriver<T> & {
    bulkSet(entries: ReadonlyArray<readonly [string, T]>): Promise<void>;
} => {
    const filePath = config.path + PACK_SUFFIX;
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
            // File doesn't exist yet — start empty.
        }
    };

    const save = async (): Promise<void> => {
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await writeFileAtomic(filePath, v8.serialize(map));
    };

    return {
        get: async (key) => {
            await ensureLoaded();
            return map.get(key);
        },

        set: async (key, value) => {
            // Single-entry set rewrites the whole pack. High-volume callers
            // should use bulkSet (via ResultCache.setMany + flush) instead.
            await ensureLoaded();
            map.set(key, value);
            await save();
        },

        has: async (key) => {
            await ensureLoaded();
            return map.has(key);
        },

        delete: async (key) => {
            await ensureLoaded();
            map.delete(key);
            await save();
        },

        clear: async () => {
            map.clear();
            // Mark as loaded so the next operation doesn't try to re-read the
            // (now-deleted) file off disk.
            loaded = true;
            try { await fs.unlink(filePath); } catch { /* already gone */ }
        },

        getStats: async (): Promise<DriverStats> => {
            await ensureLoaded();
            let size = 0;
            try {
                const stat = await fs.stat(filePath);
                size = stat.size;
            } catch {
                // File not written yet.
            }
            return { entries: map.size, size };
        },

        bulkSet: async (entries) => {
            await ensureLoaded();
            for (const [k, v] of entries) map.set(k, v);
            await save();
        },
    };
};
