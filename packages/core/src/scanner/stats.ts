/**
 * Statistics Calculation
 *
 * Pure functions for calculating scan statistics.
 * All functions are deterministic and side-effect free.
 */

import path from 'node:path';
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
        // Create new Map to maintain immutability
        return new Map(map).set(ext, count + 1);
    }, new Map<string, number>());

/**
 * Calculates total size of files (placeholder - requires I/O).
 *
 * For now returns 0 (actual implementation would require fs.stat calls).
 *
 * @param _files - Array of file paths
 * @returns Total size in bytes (currently 0)
 */
export const calculateTotalSize = (
    _files: ReadonlyArray<string>
): number => {
    // TODO: Implement actual size calculation
    // Would require fs.stat for each file (side effect)
    // For FP approach, could be done as separate optional enrichment step
    return 0;
};

/**
 * Calculates scan statistics from file list.
 *
 * Pure function:
 * - No side effects
 * - Deterministic
 * - Returns new object
 *
 * @param files - Array of discovered files
 * @param startTime - Scan start time (from performance.now())
 * @param cacheHit - Whether result came from cache
 * @returns Complete scan statistics
 */
export const calculateStats = (
    files: ReadonlyArray<string>,
    startTime: number,
    cacheHit: boolean = false
): ScanStatistics => {
    const byExtension = groupFilesByExtension(files);
    const totalSize = calculateTotalSize(files);
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
