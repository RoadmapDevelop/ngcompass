/**
 * Statistics Calculation
 *
 * Mostly pure functions for calculating scan statistics.
 * calculateTotalSize and calculateStats are async due to fs.stat I/O.
 */

import path from 'node:path';
import { stat } from 'node:fs/promises';
import type { ScanStatistics } from './types.js';

// ==============================================================================
// CONCURRENCY HELPER
// ==============================================================================

/**
 * Runs an array of async task factories with a concurrency cap.
 *
 * Uses a worker-pool pattern: `concurrency` coroutines each pull from a
 * shared index until all tasks are consumed. This keeps at most `concurrency`
 * promises in-flight at any time, preventing file-descriptor exhaustion on
 * large repos.
 *
 * @param tasks - Factory functions that create the promise for each item
 * @param concurrency - Maximum number of simultaneous promises
 * @returns PromiseSettledResult array in the same order as `tasks`
 */
const runWithLimit = async <T>(
    tasks: ReadonlyArray<() => Promise<T>>,
    concurrency: number
): Promise<PromiseSettledResult<T>[]> => {
    const results: PromiseSettledResult<T>[] = new Array(tasks.length);
    let cursor = 0;

    const worker = async (): Promise<void> => {
        while (cursor < tasks.length) {
            const i = cursor++;
            try {
                results[i] = { status: 'fulfilled', value: await tasks[i]() };
            } catch (reason) {
                results[i] = { status: 'rejected', reason };
            }
        }
    };

    // Spawn at most `concurrency` workers (but never more than tasks.length).
    await Promise.all(
        Array.from({ length: Math.min(concurrency, tasks.length) }, worker)
    );

    return results;
};

/**
 * Groups files by extension.
 *
 * Pure function using reduce pattern.
 *
 * @param files - Array of file paths
 * @returns Map of extension to file count
 */
export const groupFilesByExtension = (
    files: ReadonlyArray<string>
): ReadonlyMap<string, number> =>
    files.reduce((map, file) => {
        const ext = path.extname(file) || '.no-extension';
        const count = map.get(ext) ?? 0;
        map.set(ext, count + 1);
        return map;
    }, new Map<string, number>());

/**
 * Calculates the total size of all files in bytes.
 *
 * Runs fs.stat calls with a concurrency cap of 128 so that a single
 * unreadable file never blocks the rest, while also preventing
 * file-descriptor exhaustion on large repos.  Files that cannot be
 * stat-ed (race-condition deletion, permission errors) silently contribute 0.
 *
 * @param files - Absolute file paths
 * @returns Total size in bytes
 */
export const calculateTotalSize = async (
    files: ReadonlyArray<string>
): Promise<number> => {
    const tasks = files.map(f => () => stat(f));
    const results = await runWithLimit(tasks, 128);
    return results.reduce<number>((sum, result) => {
        return sum + (result.status === 'fulfilled' ? result.value.size : 0);
    }, 0);
};

/**
 * Calculates scan statistics from file list.
 *
 * Async because totalSize requires fs.stat I/O.
 * Timing captures wall-clock time up to the point statistics are finalized.
 *
 * @param files - Array of discovered files
 * @param startTime - Scan start time (from performance.now())
 * @param cacheHit - Whether result came from cache
 * @returns Complete scan statistics
 */
export const calculateStats = async (
    files: ReadonlyArray<string>,
    startTime: number,
    cacheHit: boolean = false
): Promise<ScanStatistics> => {
    const byExtension = groupFilesByExtension(files);
    const totalSize = await calculateTotalSize(files);
    const scanTime = performance.now() - startTime;

    return {
        totalFiles: files.length,
        byExtension,
        totalSize,
        scanTime,
        cacheHit
    };
};

/**
 * Formats file count by extension for display.
 *
 * Pure function - transforms data for output.
 *
 * @param byExtension - Map of extension to count
 * @returns Formatted string representation
 */
export const formatExtensionBreakdown = (
    byExtension: ReadonlyMap<string, number>
): string => {
    const entries = Array.from(byExtension.entries())
        .sort(([, a], [, b]) => b - a); // Sort by count descending

    return entries
        .map(([ext, count]) => `${ext}: ${count}`)
        .join(', ');
};

/**
 * Calculates summary statistics.
 *
 * Pure function - derives summary from detailed stats.
 *
 * @param stats - Scan statistics
 * @returns Summary object
 */
export const calculateSummary = (stats: ScanStatistics) => ({
    totalFiles: stats.totalFiles,
    uniqueExtensions: stats.byExtension.size,
    avgTimePerFile: stats.totalFiles > 0
        ? stats.scanTime / stats.totalFiles
        : 0,
    cacheHit: stats.cacheHit
});
