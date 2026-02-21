/**
 * Analysis Orchestrator
 *
 * Executes tasks against rule executors with memoized parsing and I/O.
 * Produces aggregated RuleResult outputs and summary statistics.
 *
 * This module orchestrates the analysis pipeline by delegating to:
 * - analysis-context.ts  (memoized file reads and parsing)
 * - worker-pool.ts       (parallel worker thread execution)
 * - analysis-stats.ts    (aggregate statistics)
 * - runner.ts            (batched single-pass rule execution)
 */

import pLimit from "p-limit";

import { Task, ExecutionPlanOutput } from "../planner/index.js";
import { CacheContext } from "../cache/index.js";
import { RuleResult, Result, Ok, Err, AnalysisResult } from "../rules/types.js";
import { debug } from "@ngcompass/common";

import { createAnalysisContext } from "./analysis-context.js";
import { runAnalysisParallel, groupTasksByFile } from "./worker-pool.js";
import { calculateStats } from "./analysis-stats.js";
import { executeBatchedTasks } from "./runner.js";

// Re-export for backward compatibility (public API)
export type { AnalysisContext } from "./analysis-context.js";
export { createAnalysisContext } from "./analysis-context.js";

/**
 * Options for running the analysis.
 */
export interface AnalysisOptions {
    /** Root directory for resolving file paths */
    readonly rootDir: string;

    /** Optional cache context for retrieving skipped task results */
    readonly cache?: CacheContext;

    /** Enable debug logging */
    readonly debug?: boolean;
}

/**
 * Runs analysis executing a plan.
 *
 * Handles both pending tasks (executed via engine) and skipped tasks (retrieved from cache).
 *
 * @param plan - The execution plan to run
 * @param options - Analysis options
 * @returns Aggregated analysis result
 */
export const runAnalysis = async (
    plan: ExecutionPlanOutput,
    options: AnalysisOptions
): Promise<Result<AnalysisResult>> => {
    try {
        // 0. Short-circuit: Return cached analysis if available
        if (plan.precomputedAnalysis) {
            debug("engine", "Returning precomputed analysis from cache (global hash match)");
            return Ok(plan.precomputedAnalysis);
        }

        const startTime = performance.now();
        const { tasks, skippedTasks, cachedResults } = plan;

        // 1. Execute Pending Tasks
        let executedResults: RuleResult[] = [];
        if (tasks.length > 0) {
            if (tasks.length > 150) {
                // Worker pool for heavy loads
                debug("engine", `Running analysis on ${tasks.length} tasks using workers...`);
                const result = await runAnalysisParallel(tasks, options.rootDir, startTime);
                if (result.ok) {
                    executedResults = result.data.results as RuleResult[];
                } else {
                    return result;
                }
            } else {
                // Sequential/Local for small loads with batching by file
                debug("engine", `Running analysis on ${tasks.length} tasks locally with batching...`);
                executedResults = await executeTasksLocally(tasks, options.rootDir);
            }
        }

        // 2. Retrieve Cached Results for Skipped Tasks
        const skippedResults = await retrieveSkippedResults(skippedTasks, cachedResults, options.cache);

        // 3. Aggregate Results
        const successful = [...executedResults, ...skippedResults];

        const finalResult: AnalysisResult = {
            results: successful,
            parseErrors: [],
            stats: calculateStats(successful, startTime),
        };

        // 4. Cache the full analysis result if global hash is present
        if (options.cache && plan.globalHash) {
            debug("engine", "Caching full analysis result for global hash...");

            if (options.debug) {
                debug("engine", `Analysis Results: ${finalResult.results.length} items`);
                if (finalResult.results.length > 0) {
                    debug("engine", `Sample item keys: ${Object.keys(finalResult.results[0]).join(', ')}`);
                }
            }

            try {
                await options.cache.analysis.set(plan.globalHash, finalResult);
            } catch (err) {
                debug("engine", `Failed to cache analysis result: ${err instanceof Error ? err.message : String(err)}`);
            }
        }

        return Ok(finalResult);

    } catch (e) {
        return Err(e instanceof Error ? e : new Error(String(e)));
    }
};

// ============================================
// INTERNAL HELPERS
// ============================================

/**
 * Executes tasks locally using batched single-pass analysis.
 */
const executeTasksLocally = async (tasks: ReadonlyArray<Task>, rootDir: string): Promise<RuleResult[]> => {
    const context = createAnalysisContext(rootDir);
    const tasksByFile = groupTasksByFile(tasks);

    debug("engine", `Grouped ${tasks.length} tasks into ${tasksByFile.size} file batches`);

    const limit = pLimit(4);
    const results = await Promise.all(
        Array.from(tasksByFile.values()).map(fileTasks =>
            limit(() => executeBatchedTasks(fileTasks, context))
        )
    );

    return results.flat().filter((r): r is RuleResult => r !== null);
};

/**
 * Retrieves cached results for skipped tasks.
 */
const retrieveSkippedResults = async (
    skippedTasks: ReadonlyArray<Task>,
    cachedResults: ReadonlyMap<string, unknown> | undefined,
    cache?: CacheContext
): Promise<RuleResult[]> => {
    if (skippedTasks.length === 0) return [];

    debug("engine", `Retrieving results for ${skippedTasks.length} skipped tasks...`);

    const skippedResults: RuleResult[] = [];
    const tasksToFetch: Task[] = [];

    // Try pre-loaded cachedResults first
    if (cachedResults) {
        for (const task of skippedTasks) {
            const result = cachedResults.get(task.taskId);
            if (result) {
                skippedResults.push(result as unknown as RuleResult);
            } else {
                tasksToFetch.push(task);
            }
        }
    } else {
        tasksToFetch.push(...skippedTasks);
    }

    // Fetch remaining from cache service
    if (tasksToFetch.length > 0 && cache) {
        debug("engine", `Fetching ${tasksToFetch.length} results from cache service...`);
        const taskIds = tasksToFetch.map(t => t.taskId);
        const cachedEntries = await cache.results.getMany(taskIds);

        for (const task of tasksToFetch) {
            const entry = cachedEntries.get(task.taskId);
            if (entry) {
                skippedResults.push(entry as unknown as RuleResult);
            }
        }
    }

    debug("engine", `Retrieved ${skippedResults.length} results from cache`);
    return skippedResults;
};
