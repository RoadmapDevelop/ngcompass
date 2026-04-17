/**
 * @fileoverview
 * Provides utilities for calculating and formatting file scan statistics.
 *
 * Implements high-performance aggregation logic, including asynchronous file size
 * summation with concurrency control and extension-based grouping.
 */

import path from 'node:path';
import { stat } from 'node:fs/promises';
import type { ScanStatistics } from './types.js';

// ==============================================================================
// CONCURRENCY HELPER
// ==============================================================================

/**
 * Executes a collection of asynchronous tasks with a specified concurrency limit.
 *
 * Employs a worker pool pattern to prevent resource exhaustion, such as
 * file-descriptor limits, while maintaining high throughput.
 *
 * @param tasks - A collection of asynchronous task factories.
 * @param concurrency - The maximum number of concurrent operations permitted.
 * @returns A promise resolving to an array of settled result objects.
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

    await Promise.all(
        Array.from({ length: Math.min(concurrency, tasks.length) }, worker)
    );

    return results;
};

const groupFilesByExtension = (
    files: ReadonlyArray<string>
): ReadonlyMap<string, number> =>
    files.reduce((map, file) => {
        const ext = path.extname(file) || '.no-extension';
        const count = map.get(ext) ?? 0;
        map.set(ext, count + 1);
        return map;
    }, new Map<string, number>());

const calculateTotalSize = async (
    files: ReadonlyArray<string>
): Promise<number> => {
    const tasks = files.map(f => () => stat(f));
    const results = await runWithLimit(tasks, 128);
    return results.reduce<number>((sum, result) => {
        return sum + (result.status === 'fulfilled' ? result.value.size : 0);
    }, 0);
};

/**
 * Generates comprehensive scan statistics for a collection of discovered files.
 *
 * @param files - The collection of discovered file paths.
 * @param startTime - The high-resolution start time of the scan operation.
 * @param cacheHit - Indicates whether the results were retrieved from a cache.
 * @returns A promise resolving to the computed scan statistics.
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

