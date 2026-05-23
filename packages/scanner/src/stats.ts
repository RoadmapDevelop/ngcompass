/**
 * @fileoverview
 * Scan-time statistics aggregator.
 *
 * Computes per-extension counts and a total byte size for the discovered
 * file list. The size pass is parallelized through a small worker pool so
 * file-descriptor pressure stays bounded on very large scans.
 */

import { stat } from 'node:fs/promises';
import path from 'node:path';
import type { ScanStatistics } from './types.js';

/**
 * Maximum concurrent `fs.stat` calls during size summation. Sized to stay
 * well under typical OS per-process file-descriptor limits while keeping
 * throughput high on SSDs.
 */
const STAT_CONCURRENCY = 128;

/** Runs `tasks` with at most `concurrency` of them in flight at once. */
const runWithLimit = async <T>(
    tasks: ReadonlyArray<() => Promise<T>>,
    concurrency: number,
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

    await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, worker));
    return results;
};

/** Buckets `files` by extension; entries without an extension use `.no-extension`. */
const groupFilesByExtension = (
    files: ReadonlyArray<string>,
): ReadonlyMap<string, number> => {
    const map = new Map<string, number>();
    for (const file of files) {
        const ext = path.extname(file) || '.no-extension';
        map.set(ext, (map.get(ext) ?? 0) + 1);
    }
    return map;
};

const calculateTotalSize = async (files: ReadonlyArray<string>): Promise<number> => {
    const tasks = files.map((f) => () => stat(f));
    const results = await runWithLimit(tasks, STAT_CONCURRENCY);
    let total = 0;
    for (const result of results) {
        if (result.status === 'fulfilled') total += result.value.size;
    }
    return total;
};

/**
 * Computes the {@link ScanStatistics} for a discovered file list.
 *
 * @param files     - File paths produced by discovery + filtering.
 * @param startTime - High-resolution start time captured at scan kickoff.
 * @param cacheHit  - `true` when the scan was satisfied entirely from cache.
 */
export const calculateStats = async (
    files: ReadonlyArray<string>,
    startTime: number,
    cacheHit: boolean = false,
): Promise<ScanStatistics> => {
    const byExtension = groupFilesByExtension(files);
    const totalSize = await calculateTotalSize(files);
    const scanTime = performance.now() - startTime;

    return { totalFiles: files.length, byExtension, totalSize, scanTime, cacheHit };
};
