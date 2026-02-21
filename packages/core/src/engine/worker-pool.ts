/**
 * Worker Pool
 *
 * Manages worker thread lifecycle for parallel analysis execution.
 * Extracted from orchestrator.ts for separation of concerns.
 */

import pLimit from "p-limit";

import { Task } from "../planner/index.js";
import { RuleResult, Result, Ok, AnalysisResult } from "../rules/types.js";
import { warn, error, debug, createInfrastructureError } from "@ngcompass/common";

import { createAnalysisContext } from "./analysis-context.js";
import { calculateStats } from "./analysis-stats.js";
import { executeBatchedTasks } from "./runner.js";

/**
 * Simple spinner for showing progress during worker execution.
 */
class Spinner {
    private frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    private frameIndex = 0;
    private interval: NodeJS.Timeout | null = null;
    private message: string = '';

    start(message: string) {
        this.message = message;
        this.frameIndex = 0;

        // Hide cursor
        process.stdout.write('\x1B[?25l');

        this.interval = setInterval(() => {
            const frame = this.frames[this.frameIndex];
            process.stdout.write(`\r${frame} ${this.message}`);
            this.frameIndex = (this.frameIndex + 1) % this.frames.length;
        }, 80);
    }

    stop(finalMessage?: string) {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }

        // Clear line and show cursor
        process.stdout.write('\r\x1B[K');
        if (finalMessage) {
            process.stdout.write(finalMessage + '\n');
        }
        process.stdout.write('\x1B[?25h');
    }
}

/**
 * Runs analysis in parallel across worker threads.
 *
 * Falls back to local concurrent execution if the worker script is not found.
 *
 * @param tasks - Tasks to execute
 * @param rootDir - Root directory for resolving paths
 * @param startTime - Start timestamp for stats
 * @returns Aggregated analysis result
 */
export const runAnalysisParallel = async (
    tasks: ReadonlyArray<Task>,
    rootDir: string,
    startTime: number,
    /**
     * RFC §7.3: Caller-supplied effective worker count.
     * Already clamped to [1, CPUs] by the orchestrator.
     * Defaults to max(2, CPUs) for backward compatibility when called directly.
     */
    maxWorkers?: number
): Promise<Result<AnalysisResult>> => {
    const { Worker } = await import("node:worker_threads");
    const os = await import("node:os");

    // Use caller-supplied value (already clamped); fall back to previous default
    const workerCount = maxWorkers ?? Math.max(2, os.cpus().length);
    const workerPath = await resolveWorkerPath();

    if (!workerPath) {
        warn("workers", "Execution worker not found, falling back to local execution.");
        return runLocalFallback(tasks, rootDir, startTime);
    }

    // Distribute tasks to workers (grouping by file)
    const chunks = distributeTasks(tasks, workerCount);

    // Start spinner
    const spinner = new Spinner();
    spinner.start(`Analyzing ${tasks.length} tasks across ${workerCount} workers...`);

    let completedWorkers = 0;
    const updateSpinner = () => {
        completedWorkers++;
        spinner.stop();
        spinner.start(`Analyzing ${tasks.length} tasks across ${workerCount} workers... (${completedWorkers}/${workerCount} complete)`);
    };

    // Dispatch to workers
    const promises = chunks.map((chunk) => {
        return new Promise<RuleResult[]>((resolve, reject) => {
            const worker = new Worker(workerPath, {
                workerData: {
                    rootDir,
                    tasks: chunk,
                },
            });

            worker.on("message", (msg: { results: RuleResult[], errors: any[] }) => {
                if (msg.errors && msg.errors.length > 0) {
                    msg.errors.forEach(e => {
                        error("workers", `Worker failed task ${e.task.taskId}:`, e.error);
                    });
                }
                updateSpinner();
                resolve(msg.results);
            });

            worker.on("error", (err) => {
                updateSpinner();
                reject(err instanceof Error ? err : new Error(String(err)));
            });
            worker.on("exit", (code) => {
                if (code !== 0) {
                    // Record a structured WorkerCrash error (RFC §7.5)
                    const infraErr = createInfrastructureError('WorkerCrash', {
                        cause: `Worker exited with code ${code}`,
                        phase: 'engine',
                        recoverable: true,
                        details: { exitCode: code },
                    });
                    error("workers", `Worker crashed: ${infraErr.cause}`);
                    reject(new Error(infraErr.cause));
                }
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
 * Falls back to local concurrent execution when worker script is not found.
 */
const runLocalFallback = async (
    tasks: ReadonlyArray<Task>,
    rootDir: string,
    startTime: number
): Promise<Result<AnalysisResult>> => {
    const context = createAnalysisContext(rootDir);
    const limit = pLimit(4);

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
 * Groups tasks by file path.
 */
export const groupTasksByFile = (tasks: ReadonlyArray<Task>): Map<string, Task[]> => {
    const tasksByFile = new Map<string, Task[]>();
    for (const task of tasks) {
        const fileTasks = tasksByFile.get(task.filePath) ?? [];
        fileTasks.push(task);
        if (fileTasks.length === 1) {
            tasksByFile.set(task.filePath, fileTasks);
        }
    }
    return tasksByFile;
};

/**
 * Resolves the worker script path.
 */
const resolveWorkerPath = async (): Promise<string | null> => {
    const { fileURLToPath } = await import("node:url");
    const { dirname, join } = await import("node:path");
    const { existsSync } = await import("node:fs");

    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);

    const candidates = [
        join(__dirname, "execution-worker.js"),
        join(__dirname, "execution-worker.cjs"),
        join(__dirname, "engine", "execution-worker.js"),
        join(__dirname, "engine", "execution-worker.cjs"),
        join(__dirname, "src", "engine", "execution-worker.ts"), // For dev/test
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
