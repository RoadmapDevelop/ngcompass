/**
 * @fileoverview
 * Filesystem helpers shared by the cache drivers.
 *
 * Currently exposes a single recursive directory-statistics function that
 * the disk and atomic drivers use to report on-disk footprint without
 * cracking open every individual file.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { debug } from '@ngcompass/common';

/**
 * Recursively counts files and sums byte sizes under `dirPath`.
 *
 * Missing directories produce `{ entries: 0, size: 0 }` rather than
 * throwing — the driver only calls this for user-facing `getInfo()` output
 * and a missing directory is the same as an empty cache. Per-file `stat`
 * errors during traversal are logged at debug level and skipped so a
 * transient race condition doesn't break the whole stats computation.
 *
 * @param dirPath - Absolute or cwd-relative directory to inspect.
 * @returns Cumulative entry count and on-disk size in bytes.
 */
export async function getDirectoryStats(
    dirPath: string,
): Promise<{ entries: number; size: number }> {
    let entries = 0;
    let size = 0;

    try {
        await fs.access(dirPath);
    } catch {
        return { entries: 0, size: 0 };
    }

    async function traverse(currentPath: string): Promise<void> {
        const files = await fs.readdir(currentPath, { withFileTypes: true });
        for (const file of files) {
            const fullPath = path.join(currentPath, file.name);
            if (file.isDirectory()) {
                await traverse(fullPath);
            } else {
                entries++;
                const stats = await fs.stat(fullPath);
                size += stats.size;
            }
        }
    }

    try {
        await traverse(dirPath);
    } catch (err) {
        // Race conditions (file deleted mid-walk) are expected. Log so
        // operators can see them without surfacing them as cache failures.
        const message = err instanceof Error ? err.message : String(err);
        debug('cache', `getDirectoryStats partial failure on ${dirPath}: ${message}`);
    }

    return { entries, size };
}
