import { createRequire } from "node:module";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";
import { Result, AnalysisResult, RuleResult, WorkerTaskError, WorkerMessageResult, createInfrastructureError, Ok, debug } from "@ngcompass/common";
import { MIN_WORKER_COUNT } from "./constants.js";
import { createAnalysisContext } from "./analysis-context.js";
import { calculateStats } from "./analysis-stats.js";
import { executeBatchedTasks } from "./runner.js";
import { Task, groupTasksByFile } from "@ngcompass/planner";
import pLimit from "p-limit";
import { Spinner } from "./spinner.js";

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
    concurrency?: number
): Promise<Result<AnalysisResult>> => {
    const { Worker } = await import("node:worker_threads");

    const workerCount = maxWorkers ?? Math.max(MIN_WORKER_COUNT, os.cpus().length);
    const workerPath = await resolveWorkerPath();

    if (!workerPath) {
        debug("workers", "Execution worker not found, falling back to local execution.");
        return runLocalFallback(tasks, rootDir, startTime, concurrency ?? workerCount);
    }

    const chunks = distributeTasks(tasks, workerCount);

    const spinner = new Spinner();
    spinner.start(`Analyzing ${tasks.length} tasks across ${workerCount} workers...`);

    let completedWorkers = 0;
    const updateSpinner = () => {
        completedWorkers++;
        spinner.stop();
        spinner.start(`Analyzing ${tasks.length} tasks across ${workerCount} workers... (${completedWorkers}/${workerCount} complete)`);
    };

    const promises = chunks.map((chunk) => {
        return new Promise<RuleResult[]>((resolve, reject) => {
            let settled = false;

            const worker = new Worker(workerPath, {
                workerData: {
                    rootDir,
                    tasks: chunk,
                },
            });

            worker.on("message", (msg: WorkerMessageResult) => {
                if (settled) return;
                settled = true;
                if (msg.errors && msg.errors.length > 0) {
                    msg.errors.forEach((e: WorkerTaskError) => {
                        debug("workers", `Worker failed task ${e.task.taskId}: ${e.error}`);
                    });
                }
                updateSpinner();
                resolve(msg.results);
            });

            worker.on("error", (err) => {
                if (settled) return;
                settled = true;
                updateSpinner();
                reject(err instanceof Error ? err : new Error(String(err)));
            });

            worker.on("exit", (code) => {
                if (settled || code === 0) return;
                settled = true;
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
        spinner.stop();
    } catch (e) {
        spinner.stop();
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
 *
 * @param concurrency - pLimit concurrency. Callers should pass maxWorkers (or
 *   LOCAL_CONCURRENCY_LIMIT) so the fallback respects the configured limit.
 */
const runLocalFallback = async (
    tasks: ReadonlyArray<Task>,
    rootDir: string,
    startTime: number,
    concurrency: number
): Promise<Result<AnalysisResult>> => {
    const context = createAnalysisContext(rootDir);
    const limit = pLimit(concurrency);

    const tasksByFile = groupTasksByFile(tasks);

    const results = await Promise.all(
        Array.from(tasksByFile.values()).map(fileTasks =>
            limit(() => executeBatchedTasks(fileTasks, context))
        )
    );
    const successful = results.flat();
    return Ok({
        results: successful,
        parseErrors: [],
        stats: calculateStats(successful, startTime),
    });
};


/**
 * Resolves the execution-worker script path.
 *
 * Search order:
 *  1. Package resolution via createRequire — finds the worker in
 *     @ngcompass/rules (canonical location after TICKET-001 refactor).
 *  2. Filesystem probes relative to __dirname — handles dev/test scenarios
 *     where packages haven't been built into node_modules yet.
 */
const resolveWorkerPath = async (): Promise<string | null> => {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);

    try {
        const req = createRequire(import.meta.url);
        const workerFromRules = req.resolve('@ngcompass/rules/execution-worker');
        if (existsSync(workerFromRules)) return workerFromRules;
    } catch {
    }

    const candidates = [
        join(__dirname, "..", "..", "rules", "dist", "execution-worker.js"),
        join(__dirname, "..", "..", "rules", "dist", "execution-worker.cjs"),
        join(__dirname, "..", "..", "rules", "src", "execution-worker.ts"),
    ];

    for (const candidate of candidates) {
        if (existsSync(candidate)) return candidate;
    }

    return null;
};

/**
 * Distributes tasks to workers while keeping file-groups together.
 *
 * Uses a greedy partition algorithm (Longest Processing Time first) to balance
 * the load across workers.
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
