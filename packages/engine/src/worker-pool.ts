import { createRequire } from "node:module";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";
import { Result, AnalysisResult, RuleResult, createInfrastructureError, Ok, debug } from "@ngcompass/common";
import { createAnalysisContext } from "./analysis-context.js";
import { calculateStats } from "./analysis-stats.js";
import { executeBatchedTasks } from "./runner.js";
import { Task, groupTasksByFile } from "@ngcompass/planner";
/** Local mirror of ExecutionWorkerResult to avoid a circular @ngcompass/rules import. */
interface WorkerTaskError { task: { taskId: string }; error: string; }
interface WorkerMessageResult { results: RuleResult[]; errors: WorkerTaskError[]; }
import pLimit from "p-limit";
import { Spinner } from "./spinner.js";

/**
 * Runs analysis in parallel across worker threads.
 *
 * Falls back to local concurrent execution if the worker script is not found.
 *
 * @param tasks - Tasks to execute
 * @param rootDir - Root directory for resolving paths
 * @param startTime - Start timestamp for stats
 * @param maxWorkers - RFC §7.3: Caller-supplied effective worker count.
 *   Already clamped to [1, CPUs] by the orchestrator.
 *   Defaults to max(2, CPUs) for backward compatibility when called directly.
 * @param concurrency - Concurrency limit for the local fallback path.
 *   Defaults to 4 when not supplied; callers should pass maxWorkers so the
 *   fallback respects the configured worker limit.
 * @returns Aggregated analysis result
 */
export const runAnalysisParallel = async (
    tasks: ReadonlyArray<Task>,
    rootDir: string,
    startTime: number,
    maxWorkers?: number,
    concurrency?: number
): Promise<Result<AnalysisResult>> => {
    const { Worker } = await import("node:worker_threads");

    // Use caller-supplied value (already clamped); fall back to previous default
    const workerCount = maxWorkers ?? Math.max(2, os.cpus().length);
    const workerPath = await resolveWorkerPath();

    if (!workerPath) {
        debug("workers", "Execution worker not found, falling back to local execution.");
        return runLocalFallback(tasks, rootDir, startTime, concurrency ?? workerCount);
    }

    // Distribute tasks to workers (grouping by file)
    const chunks = distributeTasks(tasks, workerCount);

    // Start spinner
    const spinner = new Spinner();
    spinner.start(`Analyzing ${tasks.length} tasks across ${workerCount} workers...`);

    // `completedWorkers` is mutated only from Promise microtask callbacks which are
    // serialized on the JS event loop — no concurrent mutation is possible.
    let completedWorkers = 0;
    const updateSpinner = () => {
        completedWorkers++;
        spinner.stop();
        spinner.start(`Analyzing ${tasks.length} tasks across ${workerCount} workers... (${completedWorkers}/${workerCount} complete)`);
    };

    // Dispatch to workers
    const promises = chunks.map((chunk) => {
        return new Promise<RuleResult[]>((resolve, reject) => {
            // `settled` prevents both "message" and "exit" from resolving/rejecting
            // the same promise after it has already settled.
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
                // Only act on non-zero exit AND only if we haven't already settled
                // via the "message" or "error" event.
                if (settled || code === 0) return;
                settled = true;
                // Record a structured WorkerCrash error (RFC §7.5)
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
        spinner.stop(`✓ Analysis complete (${tasks.length} tasks processed)`);
    } catch (e) {
        spinner.stop(`✗ Analysis failed`);
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

    // 1. Resolve via package registry (canonical — worker lives in @ngcompass/rules)
    try {
        const req = createRequire(import.meta.url);
        const workerFromRules = req.resolve('@ngcompass/rules/execution-worker');
        if (existsSync(workerFromRules)) return workerFromRules;
    } catch {
        // @ngcompass/rules not resolvable from current location — fall through
    }

    // 2. Filesystem probes for monorepo dev/test (sibling dist directories)
    const candidates = [
        // Monorepo sibling: engine dist → rules dist
        join(__dirname, "..", "..", "rules", "dist", "execution-worker.js"),
        join(__dirname, "..", "..", "rules", "dist", "execution-worker.cjs"),
        // Raw TS source (requires ts-node / tsx in dev)
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

    // Sort files by task count (descending) for better packing
    const sortedFiles = Array.from(tasksByFile.values()).sort((a, b) => b.length - a.length);

    // Initialize worker buckets
    const buckets: Task[][] = Array.from({ length: workerCount }, () => []);
    const bucketLoads = new Array(workerCount).fill(0);

    // Distribute files to the least loaded bucket
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
