/**
 * @fileoverview
 * Parallel analysis via worker threads.
 *
 * Distributes syntax-only tasks across a pool of `Worker` instances. Each
 * worker runs the shared execution-worker script bundled by
 * `@ngcompass/rules`; workers post per-file progress events back and a final
 * result message when their chunk completes.
 *
 * Two fallbacks are wired in:
 *  - If the worker script cannot be resolved on disk the pool falls back to
 *    local concurrent execution via `pLimit`.
 *  - A hung worker is forcibly terminated after `WORKER_TIMEOUT_MS`.
 */

import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    AnalysisResult,
    createInfrastructureError,
    debug,
    Ok,
    Result,
    RuleResult,
    WorkerTaskError,
    type WorkerMessageResult,
} from '@ngcompass/common';
import { groupTasksByFile, type Task } from '@ngcompass/planner';
import pLimit from 'p-limit';

import { createAnalysisContext } from './analysis-context.js';
import { calculateStats } from './analysis-stats.js';
import { MIN_WORKER_COUNT, WORKER_TIMEOUT_MS } from './constants.js';
import { buildFileProgress, isWorkerFileProgress, type AnalysisFileProgress } from './progress.js';
import { executeBatchedTasks } from './runner.js';

/** Runs `tasks` across a worker pool, falling back to local execution on failure. */
export const runAnalysisParallel = async (
    tasks: ReadonlyArray<Task>,
    rootDir: string,
    startTime: number,
    maxWorkers?: number,
    concurrency?: number,
    onFileProgress?: (event: AnalysisFileProgress) => void,
): Promise<Result<AnalysisResult>> => {
    const { Worker } = await import('node:worker_threads');

    const workerCount = maxWorkers ?? Math.max(MIN_WORKER_COUNT, os.cpus().length);
    const workerPath = await resolveWorkerPath();

    if (!workerPath) {
        debug('workers', 'Execution worker not found, falling back to local execution.');
        return runLocalFallback(tasks, rootDir, startTime, concurrency ?? workerCount, onFileProgress);
    }

    const chunks = distributeTasks(tasks, workerCount);
    const workers: InstanceType<typeof Worker>[] = [];

    let completedWorkers = 0;
    const markWorkerComplete = (): void => {
        completedWorkers++;
        debug('workers', `Worker progress: ${completedWorkers}/${workerCount} complete`);
    };

    const promises = chunks.map((chunk) => runWorkerChunk(
        Worker,
        workerPath,
        rootDir,
        chunk,
        workers,
        markWorkerComplete,
        onFileProgress,
    ));

    let chunkResults: RuleResult[][];
    try {
        chunkResults = await Promise.all(promises);
    } catch (e) {
        // Terminate every remaining worker so we don't leak threads.
        await Promise.allSettled(workers.map((w) => w.terminate()));
        throw e;
    }

    const successful = chunkResults.flat();

    return Ok({
        results: successful,
        parseErrors: [],
        stats: calculateStats(successful, startTime),
    });
};

// ── Worker chunk orchestration ────────────────────────────────────────────

type WorkerCtor = typeof import('node:worker_threads').Worker;

/**
 * Runs a single chunk on a worker thread. Resolves with the `RuleResult[]`
 * the worker posts; rejects on error, exit code != 0, or timeout.
 */
const runWorkerChunk = (
    Worker: WorkerCtor,
    workerPath: string,
    rootDir: string,
    chunk: Task[],
    workers: InstanceType<WorkerCtor>[],
    markWorkerComplete: () => void,
    onFileProgress?: (event: AnalysisFileProgress) => void,
): Promise<RuleResult[]> =>
    new Promise<RuleResult[]>((resolve, reject) => {
        let settled = false;

        const worker = new Worker(workerPath, {
            workerData: { rootDir, tasks: chunk },
        });
        workers.push(worker);

        const settle = (): void => {
            clearTimeout(timeoutId);
            worker.removeAllListeners();
        };

        // Safety net for hung workers (e.g. infinite loop, deadlocked TS Program).
        const timeoutId = setTimeout(() => {
            if (settled) return;
            settled = true;
            settle();
            markWorkerComplete();
            void worker.terminate();
            reject(new Error(`Worker timed out after ${WORKER_TIMEOUT_MS / 1000}s`));
        }, WORKER_TIMEOUT_MS);

        worker.on('message', (msg: WorkerMessageResult) => {
            if (isWorkerFileProgress(msg)) {
                onFileProgress?.(msg);
                return;
            }
            if (settled) return;
            settled = true;
            settle();
            if (msg.errors && msg.errors.length > 0) {
                msg.errors.forEach((e: WorkerTaskError) => {
                    debug('workers', `Worker failed task ${e.task.taskId}: ${e.error}`);
                });
            }
            markWorkerComplete();
            resolve(msg.results);
        });

        worker.on('error', (err) => {
            if (settled) return;
            settled = true;
            settle();
            markWorkerComplete();
            reject(err instanceof Error ? err : new Error(String(err)));
        });

        worker.on('exit', (code) => {
            if (settled || code === 0) return;
            settled = true;
            settle();
            const infraErr = createInfrastructureError('WorkerCrash', {
                cause: `Worker exited with code ${code}`,
                phase: 'engine',
                recoverable: true,
                details: { exitCode: code },
            });
            debug('workers', `Worker crashed: ${infraErr.cause}`);
            reject(new Error(infraErr.cause));
        });
    });

// ── Local fallback ────────────────────────────────────────────────────────

/**
 * Runs `tasks` locally with `pLimit`-bounded concurrency when the worker
 * script is unavailable. Keeps the public contract identical (returns the
 * same `Result<AnalysisResult>` shape) so callers do not branch on the path.
 */
const runLocalFallback = async (
    tasks: ReadonlyArray<Task>,
    rootDir: string,
    startTime: number,
    concurrency: number,
    onFileProgress?: (event: AnalysisFileProgress) => void,
): Promise<Result<AnalysisResult>> => {
    const context = createAnalysisContext(rootDir);
    const limit = pLimit(concurrency);
    const tasksByFile = groupTasksByFile(tasks);

    const results = await Promise.all(
        Array.from(tasksByFile.values()).map((fileTasks) =>
            limit(async () => {
                const filePath = fileTasks[0]?.filePath;
                const fileStart = performance.now();
                const batchResults = await executeBatchedTasks(fileTasks, context);
                if (filePath) {
                    context.evict(filePath);
                    onFileProgress?.(
                        buildFileProgress(filePath, fileTasks.length, batchResults, performance.now() - fileStart),
                    );
                }
                return batchResults;
            }),
        ),
    );

    const successful = results.flat();
    return Ok({
        results: successful,
        parseErrors: [],
        stats: calculateStats(successful, startTime),
    });
};

// ── Worker resolution and load-balancing ──────────────────────────────────

/**
 * Resolves the execution-worker script bundled by `@ngcompass/rules`. Returns
 * `null` when the package can't be found (in which case `runLocalFallback`
 * is invoked).
 */
const resolveWorkerPath = async (): Promise<string | null> => {
    const here = dirname(fileURLToPath(import.meta.url));

    try {
        const req = createRequire(import.meta.url);
        const workerFromRules = req.resolve('@ngcompass/rules/execution-worker');
        if (existsSync(workerFromRules)) return workerFromRules;
    } catch {
        // Fall through to manual path probing for monorepo development layouts.
    }

    const candidates = [
        join(here, '..', '..', 'rules', 'dist', 'execution-worker.js'),
        join(here, '..', '..', 'rules', 'dist', 'execution-worker.cjs'),
    ];
    return candidates.find((c) => existsSync(c)) ?? null;
};

/**
 * Distributes file groups across `workerCount` buckets using a greedy
 * largest-first bin-packing strategy. All tasks for the same file always
 * end up on the same worker so file-level resources (AST, TypeChecker)
 * stay cached.
 */
const distributeTasks = (tasks: ReadonlyArray<Task>, workerCount: number): Task[][] => {
    const tasksByFile = groupTasksByFile(tasks);
    const sortedFiles = Array.from(tasksByFile.values()).sort((a, b) => b.length - a.length);

    const buckets: Task[][] = Array.from({ length: workerCount }, () => []);
    const bucketLoads = new Array(workerCount).fill(0);

    for (const fileTasks of sortedFiles) {
        let minLoadIndex = 0;
        let minLoad = bucketLoads[0];
        for (let i = 1; i < workerCount; i++) {
            if (bucketLoads[i] < minLoad) {
                minLoad = bucketLoads[i];
                minLoadIndex = i;
            }
        }
        buckets[minLoadIndex].push(...fileTasks);
        bucketLoads[minLoadIndex] += fileTasks.length;
    }
    return buckets;
};
