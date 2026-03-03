/**
 * Statistics Calculation
 *
 * Mostly pure functions for calculating scan statistics.
 * calculateTotalSize and calculateStats are async due to fs.stat I/O.
 */

import path from 'node:path';
import { stat } from 'node:fs/promises';
import type { ScanStatistics } from './types.js';

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
 * Runs all fs.stat calls concurrently via Promise.allSettled so that a
 * single unreadable file never blocks the rest. Files that cannot be
 * stat-ed (race-condition deletion, permissions) silently contribute 0.
 *
 * @param files - Absolute file paths
 * @returns Total size in bytes
 */
export const calculateTotalSize = async (
    files: ReadonlyArray<string>
): Promise<number> => {
    const results = await Promise.allSettled(files.map(f => stat(f)));
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
