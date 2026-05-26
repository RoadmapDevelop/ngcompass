import { stat } from 'node:fs/promises';
import path from 'node:path';
import type { ScanStatistics } from './types.js';

const STAT_CONCURRENCY = 128;

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
): ReadonlyMap<string, number> => {
  const map = new Map<string, number>();
  for (const file of files) {
    const ext = path.extname(file) || '.no-extension';
    map.set(ext, (map.get(ext) ?? 0) + 1);
  }
  return map;
};

const calculateTotalSize = async (
  files: ReadonlyArray<string>
): Promise<number> => {
  const tasks = files.map((f) => () => stat(f));
  const results = await runWithLimit(tasks, STAT_CONCURRENCY);
  let total = 0;
  for (const result of results) {
    if (result.status === 'fulfilled') total += result.value.size;
  }
  return total;
};

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
    cacheHit,
  };
};
