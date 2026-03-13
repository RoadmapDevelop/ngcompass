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

import os from "node:os";
import pLimit from "p-limit";

import { Task, ExecutionPlanOutput, groupTasksByFile } from "@ngcompass/planner";
import { CacheContext } from "@ngcompass/cache";
import { RuleResult, Result, Ok, Err, AnalysisResult } from "@ngcompass/common";
import { debug, createInfrastructureError, InfrastructureErrorCollector } from "@ngcompass/common";

import { createAnalysisContext } from "./analysis-context.js";
import { createTypeAwareAnalysisContext } from "./type-aware-context.js";
import { runAnalysisParallel } from "./worker-pool.js";
import { calculateStats } from "./analysis-stats.js";
import { executeBatchedTasks } from "./runner.js";


// Re-export for backward compatibility (public API)
export type { AnalysisContext } from "./analysis-context.js";
export { createAnalysisContext } from "./analysis-context.js";

/**
 * Runtime type-guard for cached rule results. (ENGINE-005)
 *
 * Validates every field so a corrupted or schema-mismatched cache entry
 * (e.g. `{ ruleName: 42, failures: "oops" }`) cannot silently pass through.
 */
function isRuleResult(value: unknown): value is RuleResult {
    if (!value || typeof value !== 'object') return false;
    const v = value as Record<string, unknown>;
    if (typeof v['ruleName'] !== 'string') return false;
    if (!Array.isArray(v['failures'])) return false;
    for (const f of v['failures'] as unknown[]) {
        if (!f || typeof f !== 'object') return false;
        const failure = f as Record<string, unknown>;
        if (typeof failure['filePath'] !== 'string') return false;
        if (typeof failure['line'] !== 'number') return false;
        if (typeof failure['column'] !== 'number') return false;
        if (typeof failure['severity'] !== 'string') return false;
    }
    return true;
}

/**
 * Runtime type-guard for a full AnalysisResult. (ENGINE-010)
 *
 * Used to validate precomputed (globally-cached) results before returning them.
 * A schema version mismatch after a tool upgrade would otherwise silently
 * return corrupted data with no error surfaced.
 */
function isValidAnalysisResult(value: unknown): value is AnalysisResult {
    if (!value || typeof value !== 'object') return false;
    const v = value as Record<string, unknown>;
    if (!Array.isArray(v['results'])) return false;
    if (!Array.isArray(v['parseErrors'])) return false;
    if (!v['stats'] || typeof v['stats'] !== 'object') return false;
    const stats = v['stats'] as Record<string, unknown>;
    if (typeof stats['totalFiles'] !== 'number') return false;
    if (typeof stats['totalErrors'] !== 'number') return false;
    if (typeof stats['totalWarnings'] !== 'number') return false;
    if (typeof stats['duration'] !== 'number') return false;
    return true;
}

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

    /**
     * Maximum number of worker threads to use.
     * Clamped to [1, os.cpus().length] (RFC §7.3 unified concurrency model).
     * Defaults to os.cpus().length.
     */
    readonly maxWorkers?: number;

    /**
     * Number of tasks above which the worker pool is used instead of local
     * pLimit execution.  Default: 150.
     */
    readonly parallelThreshold?: number;



    /**
     * Accumulator for infrastructure errors encountered during analysis.
     * If provided, structured errors are recorded here instead of being
     * silently swallowed.
     */
    readonly errorCollector?: InfrastructureErrorCollector;

    /**
     * All files discovered by the scanner for this run.
     *
     * CTX-001: Forwarded to `createTypeAwareAnalysisContext()` so the
     * `ProjectContext` import-graph builder can restrict edges to intra-project
     * imports and correctly populate `ProjectContext.projectFiles`.
     *
     * Optional for backward compatibility — when omitted the ProjectContext
     * will still be built but `projectFiles` may be less complete (derived
     * solely from the TypeScript Program's source-file list).
     */
    readonly files?: ReadonlyArray<string>;
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
        // 0. Short-circuit: Return cached analysis if available (ENGINE-010: validate schema first)
        if (plan.precomputedAnalysis) {
            if (!isValidAnalysisResult(plan.precomputedAnalysis)) {
                debug("engine", "Precomputed analysis failed schema validation — discarding stale cache entry and re-running analysis");
                // Fall through to fresh execution below
            } else {
                debug("engine", "Returning precomputed analysis from cache (global hash match)");
                return Ok(plan.precomputedAnalysis);
            }
        }

        const startTime = performance.now();
        const { tasks, skippedTasks, cachedResults } = plan;

        // RFC §7.3: Resolve effective concurrency — single source of truth
        const cpuCount = os.cpus().length;
        const effectiveMaxWorkers = Math.max(1, Math.min(options.maxWorkers ?? cpuCount, cpuCount));
        const parallelThreshold = options.parallelThreshold ?? 150;

        // CTX-001: tasks that declare either needsTypeChecker OR needsProjectContext
        // must run on the type-aware (main-thread) path so they receive a
        // populated TypeChecker and/or ProjectContext.
        const typeAwareTasks = tasks.filter(t => !!t.needsTypeChecker || !!t.needsProjectContext);
        const workerTasks    = tasks.filter(t => !t.needsTypeChecker  && !t.needsProjectContext);
        debug("engine", `workerTasks: ${workerTasks.length}, typeAwareTasks: ${typeAwareTasks.length}`);
        let executedResults: RuleResult[] = [];

        // 1a. Execute Syntax-Only Tasks (Parallel via Workers)
        if (workerTasks.length > 0) {
            if (workerTasks.length > parallelThreshold) {
                // Worker pool for heavy loads
                debug("engine", `Running analysis on ${workerTasks.length} syntax-only tasks using workers (max: ${effectiveMaxWorkers})...`);
                const result = await runAnalysisParallel(workerTasks, options.rootDir, startTime, effectiveMaxWorkers);
                if (result.ok) {
                    executedResults = result.data.results as RuleResult[];
                } else {
                    return result;
                }
            } else {
                // Sequential/Local for small loads with batching by file
                debug("engine", `Running analysis on ${workerTasks.length} syntax-only tasks locally with batching (concurrency: ${effectiveMaxWorkers})...`);
                executedResults = await executeTasksLocally(workerTasks, options.rootDir, effectiveMaxWorkers, false, options.errorCollector);
            }
        }

        // 1b. Execute Type-Aware Tasks (Sequentially on Main Thread)
        if (typeAwareTasks.length > 0) {
            debug("engine", `Running analysis on ${typeAwareTasks.length} type-aware tasks sequentially on the main thread...`);
            // Type-aware tasks cannot be parallelized easily without instantiating ts.Program per worker.
            // Run them locally with concurrency 1 to avoid massive memory spikes from ts-morph/TS compiler.
            // CTX-001: Pass `options.files` so the ProjectContext import-graph builder
            // knows the full set of scanner-discovered project files.
            const typeAwareResults = await executeTasksLocally(
                typeAwareTasks,
                options.rootDir,
                1,
                true,
                options.errorCollector,
                options.files,
            );
            executedResults = [...executedResults, ...typeAwareResults];
        }

        // 2. Retrieve Cached Results for Skipped Tasks
        const skippedResults = await retrieveSkippedResults(skippedTasks, cachedResults, options.cache);

        // 3. Aggregate Results
        const successful = [...executedResults, ...skippedResults];

        // ENGINE-012: Compute cache hit rate so CLI consumers can report it.
        const totalTasks = tasks.length + skippedTasks.length;
        const cacheHitRate = totalTasks > 0 ? skippedResults.length / totalTasks : undefined;

        const finalResult: AnalysisResult = {
            results: successful,
            parseErrors: [],
            stats: calculateStats(successful, startTime, cacheHitRate),
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
                const msg = err instanceof Error ? err.message : String(err);
                debug("engine", `Failed to cache analysis result: ${msg}`);
                options.errorCollector?.record(createInfrastructureError('IOError', {
                    cause: `Failed to write analysis cache: ${msg}`,
                    phase: 'engine',
                    recoverable: true,
                }));
            }
        }

        return Ok(finalResult);

    } catch (e) {
        return Err(e instanceof Error ? e : new Error(String(e)));
    }
};

// ============================================================
// INTERNAL HELPERS
// ============================================================

/**
 * Executes tasks locally using batched single-pass analysis.
 *
 * RFC §7.3: concurrency is driven by effectiveMaxWorkers (= clamp(1, config.maxWorkers, CPUs))
 * instead of the previous hardcoded pLimit(4).
 */
const executeTasksLocally = async (
    tasks: ReadonlyArray<Task>,
    rootDir: string,
    concurrency: number,
    useTypeAwareContext: boolean,
    errorCollector?: InfrastructureErrorCollector,
    /** CTX-001: scanner-discovered files forwarded to ProjectContext builder. */
    files?: ReadonlyArray<string>,
): Promise<RuleResult[]> => {
    // Instantiate appropriate context.
    // CTX-001: pass `files` to the type-aware context so the import-graph
    // builder can restrict edges to known project files.
    const context = useTypeAwareContext
        ? createTypeAwareAnalysisContext(rootDir, files ?? [])
        : createAnalysisContext(rootDir);

    const tasksByFile = groupTasksByFile(tasks);

    debug("engine", `Grouped ${tasks.length} tasks into ${tasksByFile.size} file batches`);

    const limit = pLimit(concurrency);
    const results = await Promise.all(
        Array.from(tasksByFile.values()).map(fileTasks =>
            limit(async () => {
                try {
                    return await executeBatchedTasks(fileTasks, context);
                } catch (e) {
                    const msg = e instanceof Error ? e.message : String(e);
                    errorCollector?.record(createInfrastructureError('IOError', {
                        filePath: fileTasks[0]?.filePath,
                        cause: `Batch execution failed: ${msg}`,
                        phase: 'engine',
                        recoverable: true,
                    }));
                    return [];
                }
            })
        )
    );

    return results.flat().filter((r: RuleResult | null): r is RuleResult => r !== null);
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
            if (result && isRuleResult(result)) {
                skippedResults.push(result);
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
            if (entry && isRuleResult(entry)) {
                skippedResults.push(entry);
            }
        }
    }

    debug("engine", `Retrieved ${skippedResults.length} results from cache`);
    return skippedResults;
};

