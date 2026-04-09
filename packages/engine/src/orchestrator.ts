/**
 * @fileoverview
 * Implements the high-level analysis orchestration pipeline.
 *
 * The orchestrator manages the lifecycle of an analysis run, coordinating
 * task distribution across local threads and worker pools, while managing
 * analytical state, result aggregation, and caching strategies.
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
 * Structural validator for rule execution results.
 * Ensures data integrity when processing artifacts from external or cached sources.
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
 * Structural validator for comprehensive analytical results.
 * Specifically used to verify current schema compatibility for cached global results.
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
 * Configuration parameters for the analysis orchestration process.
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
     * Integrates an optional infrastructure error sink.
     * When provided, operational errors are encapsulated and reported through
     * this collector instead of triggering terminal exceptions.
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
 * Primary entry point for executing an analysis plan.
 *
 * Coordinates task execution strategies, manages result caching, and
 * synthesizes the final analytical report.
 *
 * @param plan The execution plan containing tasks and cached metadata.
 * @param options Configuration options for the orchestrator.
 * @returns A promise resolving to an AnalysisResult encapsulation.
 */
export const runAnalysis = async (
    plan: ExecutionPlanOutput,
    options: AnalysisOptions
): Promise<Result<AnalysisResult>> => {
    try {
        if (plan.precomputedAnalysis) {
            if (!isValidAnalysisResult(plan.precomputedAnalysis)) {
                debug("engine", "Precomputed analysis failed schema validation — discarding stale cache entry and re-running analysis");
            } else {
                debug("engine", "Returning precomputed analysis from cache (global hash match)");
                return Ok(plan.precomputedAnalysis);
            }
        }

        const startTime = performance.now();
        const { tasks, skippedTasks, cachedResults } = plan;

        const cpuCount = os.cpus().length;
        const effectiveMaxWorkers = Math.max(1, Math.min(options.maxWorkers ?? cpuCount, cpuCount));
        const parallelThreshold = options.parallelThreshold ?? 150;

        const typeAwareTasks = tasks.filter(t => !!t.needsTypeChecker || !!t.needsProjectContext);
        const workerTasks    = tasks.filter(t => !t.needsTypeChecker  && !t.needsProjectContext);
        debug("engine", `workerTasks: ${workerTasks.length}, typeAwareTasks: ${typeAwareTasks.length}`);
        let executedResults: RuleResult[] = [];

        if (workerTasks.length > 0) {
            if (workerTasks.length > parallelThreshold) {
                debug("engine", `Running analysis on ${workerTasks.length} syntax-only tasks using workers (max: ${effectiveMaxWorkers})...`);
                const result = await runAnalysisParallel(workerTasks, options.rootDir, startTime, effectiveMaxWorkers);
                if (result.ok) {
                    executedResults = result.data.results as RuleResult[];
                } else {
                    return result;
                }
            } else {
                debug("engine", `Running analysis on ${workerTasks.length} syntax-only tasks locally with batching (concurrency: ${effectiveMaxWorkers})...`);
                executedResults = await executeTasksLocally(workerTasks, options.rootDir, effectiveMaxWorkers, false, options.errorCollector);
            }
        }

        if (typeAwareTasks.length > 0) {
            debug("engine", `Running analysis on ${typeAwareTasks.length} type-aware tasks on the main thread (concurrency: ${effectiveMaxWorkers})...`);
            const typeAwareResults = await executeTasksLocally(
                typeAwareTasks,
                options.rootDir,
                effectiveMaxWorkers,
                true,
                options.errorCollector,
                options.files,
            );
            executedResults = [...executedResults, ...typeAwareResults];
        }

        const skippedResults = await retrieveSkippedResults(skippedTasks, cachedResults, options.cache);

        const successful = [...executedResults, ...skippedResults];

        const totalTasks = tasks.length + skippedTasks.length;
        const cacheHitRate = totalTasks > 0 ? skippedResults.length / totalTasks : undefined;

        const finalResult: AnalysisResult = {
            results: successful,
            parseErrors: [],
            stats: calculateStats(successful, startTime, cacheHitRate),
        };

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
 * Facilitates local task execution using batched, single-pass analytical patterns.
 *
 * Supports a two-phase execution lifecycle:
 * 1. Warm-up Phase: Initializes shared resources (e.g., TypeScript Programs).
 * 2. Execution Phase: Processes file batches concurrently against shared artifacts.
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
    const context = useTypeAwareContext
        ? createTypeAwareAnalysisContext(rootDir, files ?? [])
        : createAnalysisContext(rootDir);

    if (useTypeAwareContext) {
        await (context as ReturnType<typeof createTypeAwareAnalysisContext>).warmup();
        debug("engine", `Phase 1 complete — TypeScript Program ready. Starting Phase 2: ${concurrency} concurrent file batches.`);
    }

    const tasksByFile = groupTasksByFile(tasks);

    debug("engine", `Grouped ${tasks.length} tasks into ${tasksByFile.size} file batches`);

    const limit = pLimit(concurrency);
    const results = await Promise.all(
        Array.from(tasksByFile.values()).map(fileTasks =>
            limit(async () => {
                const filePath = fileTasks[0]?.filePath;
                try {
                    const batchResults = await executeBatchedTasks(fileTasks, context);
                    context.evict(filePath);
                    return batchResults;
                } catch (e) {
                    const msg = e instanceof Error ? e.message : String(e);
                    context.evict(filePath);
                    errorCollector?.record(createInfrastructureError('IOError', {
                        filePath,
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
 * Retrieves and validates results for tasks identified as skip-candidates.
 * Leverages both memory-resident and persistent cache providers.
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

