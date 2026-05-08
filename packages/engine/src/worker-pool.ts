import { createRequire } from "node:module";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";
import { Result, AnalysisResult, RuleResult, WorkerTaskError, WorkerMessageResult, WorkerFileProgress, createInfrastructureError, Ok, debug } from "@ngcompass/common";
import { MIN_WORKER_COUNT, WORKER_TIMEOUT_MS } from "./constants.js";
import { createAnalysisContext } from "./analysis-context.js";
import { calculateStats } from "./analysis-stats.js";
import { executeBatchedTasks } from "./runner.js";
import { Task, groupTasksByFile } from "@ngcompass/planner";
import pLimit from "p-limit";
import type { AnalysisFileProgress } from "./orchestrator.js";

/**
 * @fileoverview
 * Manages parallel analysis execution utilizing worker thread pools.
 *
 * Coordinates the distribution of analytical tasks across multiple workers to
 * maximize CPU utilization. Provides a resilient fallback to local concurrent
 * execution if worker resources are unavailable.
 */
export const runAnalysisParallel = async (
    tasks: ReadonlyArray<Task>,
    rootDir: string,
    startTime: number,
    maxWorkers?: number,
    concurrency?: number,
    onFileProgress?: (event: AnalysisFileProgress) => void,
): Promise<Result<AnalysisResult>> => {
    const { Worker } = await import("node:worker_threads");

    const workerCount = maxWorkers ?? Math.max(MIN_WORKER_COUNT, os.cpus().length);
    const workerPath = await resolveWorkerPath();

    if (!workerPath) {
        debug("workers", "Execution worker not found, falling back to local execution.");
        return runLocalFallback(tasks, rootDir, startTime, concurrency ?? workerCount, onFileProgress);
    }

    const chunks = distributeTasks(tasks, workerCount);

    let completedWorkers = 0;
    const markWorkerComplete = () => {
        completedWorkers++;
        debug("workers", `Worker progress: ${completedWorkers}/${workerCount} complete`);
    };

    const workers: InstanceType<typeof Worker>[] = [];

    const promises = chunks.map((chunk) => {
        return new Promise<RuleResult[]>((resolve, reject) => {
            let settled = false;

            const worker = new Worker(workerPath, {
                workerData: {
                    rootDir,
                    tasks: chunk,
                },
            });
            workers.push(worker);

            const settle = () => {
                clearTimeout(timeoutId);
                worker.removeAllListeners();
            };

            // Safety-net: forcibly terminate the worker if it does not respond
            // within WORKER_TIMEOUT_MS (e.g. hung TypeScript program or infinite loop).
            const timeoutId = setTimeout(() => {
                if (settled) return;
                settled = true;
                settle();
                markWorkerComplete();
                void worker.terminate();
                reject(new Error(`Worker timed out after ${WORKER_TIMEOUT_MS / 1000}s`));
            }, WORKER_TIMEOUT_MS);

            worker.on("message", (msg: WorkerMessageResult) => {
                if (isWorkerFileProgress(msg)) {
                    onFileProgress?.(msg);
                    return;
                }
                if (settled) return;
                settled = true;
                settle();
                if (msg.errors && msg.errors.length > 0) {
                    msg.errors.forEach((e: WorkerTaskError) => {
                        debug("workers", `Worker failed task ${e.task.taskId}: ${e.error}`);
                    });
                }
                markWorkerComplete();
                resolve(msg.results);
            });

            worker.on("error", (err) => {
                if (settled) return;
                settled = true;
                settle();
                markWorkerComplete();
                reject(err instanceof Error ? err : new Error(String(err)));
            });

            worker.on("exit", (code) => {
                if (settled || code === 0) return;
                settled = true;
                settle();
                const infraErr = createInfrastructureError('WorkerCrash', {
                    cause: `Worker exited with code ${code}`,
                    phase: 'engine',
                    recoverable: true,
                    details: { exitCode: code },
                });
                debug("workers", `Worker crashed: ${infraErr.cause}`);
                reject(new Error(infraErr.cause));
            });
        });
    });

    let chunkResults: RuleResult[][];
    try {
        chunkResults = await Promise.all(promises);
    } catch (e) {
        // Terminate remaining workers to prevent leaked threads on failure
        await Promise.allSettled(workers.map(w => w.terminate()));
        throw e;
    }

    const successful = chunkResults.flat();

    return Ok({
        results: successful,
        parseErrors: [],
        stats: calculateStats(successful, startTime),
    });
};

// ============================================
// INTERNAL HELPERS
// ============================================

/**
 * Falls back to local concurrent execution when the worker script is not found.
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
        Array.from(tasksByFile.values()).map(fileTasks =>
            limit(async () => {
                const filePath = fileTasks[0]?.filePath;
                const fileStart = performance.now();
                const batchResults = await executeBatchedTasks(fileTasks, context);
                if (filePath) context.evict(filePath);
                if (filePath) {
                    onFileProgress?.(buildFileProgress(filePath, fileTasks.length, batchResults, performance.now() - fileStart));
                }
                return batchResults;
            })
        )
    );
    const successful = results.flat();
    return Ok({
        results: successful,
        parseErrors: [],
        stats: calculateStats(successful, startTime),
    });
};

const isWorkerFileProgress = (message: unknown): message is WorkerFileProgress => (
    !!message &&
    typeof message === 'object' &&
    (message as { kind?: unknown }).kind === 'file-progress'
);

const buildFileProgress = (
    filePath: string,
    taskCount: number,
    results: ReadonlyArray<RuleResult>,
    duration: number,
): AnalysisFileProgress => {
    let errorCount = 0;
    let warningCount = 0;

    for (const result of results) {
        for (const failure of result.failures) {
            if (failure.severity === 'error') errorCount++;
            else if (failure.severity === 'warn') warningCount++;
        }
    }

    return {
        filePath,
        taskCount,
        issueCount: errorCount + warningCount,
        errorCount,
        warningCount,
        duration,
    };
};


/**
 * Resolves the execution-worker script path.
 */
const resolveWorkerPath = async (): Promise<string | null> => {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);

    try {
        const req = createRequire(import.meta.url);
        const workerFromRules = req.resolve('@ngcompass/rules/execution-worker');
        if (existsSync(workerFromRules)) return workerFromRules;
    } catch {
        // Intentionally ignore resolution errors to fall back to manual path probing
    }

    const candidates = [
        join(__dirname, "..", "..", "rules", "dist", "execution-worker.js"),
        join(__dirname, "..", "..", "rules", "dist", "execution-worker.cjs"),
    ];

    for (const candidate of candidates) {
        if (existsSync(candidate)) return candidate;
    }

    return null;
};

/**
 * Distributes tasks to workers while keeping file-groups together.
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
