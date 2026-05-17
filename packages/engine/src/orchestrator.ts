/**
 * @fileoverview
 * Implements the high-level analysis orchestration pipeline.
 *
 * The orchestrator manages the lifecycle of an analysis run, coordinating
 * task distribution across local threads and worker pools, while managing
 * analytical state, result aggregation, and caching strategies.
 */

import os from "node:os";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { fork } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import v8 from "node:v8";
import pLimit from "p-limit";

import { Task, ExecutionPlanOutput, groupTasksByFile } from "@ngcompass/planner";
import { CacheContext } from "@ngcompass/cache";
import { RuleResult, Result, Ok, Err, AnalysisResult, ParserOptions } from "@ngcompass/common";
import { debug, createInfrastructureError, InfrastructureErrorCollector } from "@ngcompass/common";

import { createAnalysisContext } from "./analysis-context.js";
import { createTypeAwareAnalysisContext } from "./type-aware-context.js";
import { runAnalysisParallel } from "./worker-pool.js";
import { calculateStats } from "./analysis-stats.js";
import { executeBatchedTasks } from "./runner.js";

const DEFAULT_TYPE_AWARE_CHUNK_SIZE = 100;
const DEFAULT_TYPE_AWARE_CONCURRENCY = 1;
const ABSOLUTE_MAX_TYPE_AWARE_CONCURRENCY = 4;
const DEFAULT_TYPE_AWARE_FILE_CONCURRENCY = 1;
const ABSOLUTE_MAX_TYPE_AWARE_FILE_CONCURRENCY = 8;
const LARGE_TYPE_AWARE_FILE_COUNT = 1000;
const LARGE_TYPE_AWARE_CHUNK_SIZE = 50;
const MAX_FULL_ANALYSIS_CACHE_RESULTS = 20_000;
const MIN_ADAPTIVE_TYPE_AWARE_CHUNK_SIZE = 10;
const ABSOLUTE_MAX_ADAPTIVE_TYPE_AWARE_CHUNK_SIZE = 2000;
const HIGH_HEAP_PRESSURE_RATIO = 0.88;
const CRITICAL_HEAP_PRESSURE_RATIO = 0.94;
const LOW_HEAP_PRESSURE_RATIO = 0.35;
const ADAPTIVE_GROWTH_STREAK = 3;
const ISOLATED_TYPE_AWARE_FILE_COUNT = 500;
const TYPE_AWARE_CHILD_TIMEOUT_MS = 10 * 60 * 1000;
const DEPENDENCY_GROUPING_CONCURRENCY = 64;
const DEPENDENCY_GROUPING_TIMEOUT_MS = 5_000;

export interface AnalysisFileProgress {
    readonly filePath: string;
    readonly taskCount: number;
    readonly issueCount: number;
    readonly errorCount: number;
    readonly warningCount: number;
    readonly duration: number;
    readonly cached?: boolean;
    readonly typeAware?: boolean;
}

interface TypeAwareChunkWork {
    readonly index: number;
    readonly tasks: ReadonlyArray<Task>;
    readonly files: ReadonlyArray<string>;
    readonly programRootFiles: ReadonlyArray<string>;
    readonly buildProjectContext: boolean;
}


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

    /** Optional TypeScript parser settings from config. */
    readonly parserOptions?: ParserOptions;

    /**
     * Maximum number of files per type-aware execution chunk.
     *
     * Type-aware tasks run on the main thread with a shared `ts.Program`.
     * For large repos the Program can consume several GB.  Chunking splits
     * the work: each chunk creates its own scoped Program, processes its
     * tasks, then lets the Program be garbage-collected before the next chunk
     * starts.  Smaller values reduce peak memory; larger values reduce the
     * number of (expensive) `ts.createProgram` calls.
     *
     * Default: 100 files per chunk, or 50 for very large type-aware runs.
     * Set to `Infinity` to disable chunking.
     */
    readonly typeAwareChunkSize?: number;

    /**
     * Runs type-aware chunks in a separate Node process. This is slower than
     * in-process execution, but gives the OS a hard memory boundary because
     * each chunk process exits after producing results.
     */
    readonly typeAwareIsolation?: 'auto' | 'process' | 'off';

    /**
     * Controls how type-aware files are ordered before chunking.
     * `dependency` attempts to keep nearby dependency groups together.
     * `simple` skips the dependency pre-pass and sorts files by path.
     */
    readonly typeAwareChunkStrategy?: 'dependency' | 'simple';

    /**
     * Maximum number of type-aware chunks allowed to run at the same time.
     * Each concurrent chunk may create its own TypeScript Program, so values
     * above one trade memory for speed.
     */
    readonly typeAwareConcurrency?: number;

    /**
     * Maximum number of files to process concurrently inside a single
     * type-aware chunk. This reuses one TypeScript Program but may hold more
     * file/template ASTs at once.
     */
    readonly typeAwareFileConcurrency?: number;

    /**
     * When true, type-checker-dependent rules are skipped entirely.
     * Use this as an escape valve for very large repos where even a chunked
     * TS Program is too memory-intensive to build.
     */
    readonly skipTypeCheck?: boolean;

    /**
     * Called whenever a batch of tasks completes.
     * @param completed - Total tasks finished so far (including cached).
     * @param total     - Grand total tasks for this run (executed + cached).
     */
    readonly onProgress?: (completed: number, total: number) => void;

    /** Called whenever all tasks for a file have completed. */
    readonly onFileProgress?: (event: AnalysisFileProgress) => void;
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
        const defaultWorkerCount = Math.max(1, Math.min(4, cpuCount - 1));
        const effectiveMaxWorkers = Math.max(1, Math.min(options.maxWorkers ?? defaultWorkerCount, cpuCount));
        const parallelThreshold = options.parallelThreshold ?? 150;

        const typeAwareTasks = tasks.filter(t => !!t.needsTypeChecker || !!t.needsProjectContext);
        const workerTasks    = tasks.filter(t => !t.needsTypeChecker  && !t.needsProjectContext);
        debug("engine", `workerTasks: ${workerTasks.length}, typeAwareTasks: ${typeAwareTasks.length}`);

        const grandTotal = tasks.length + skippedTasks.length;
        // Cached tasks count as instantly done — start progress there.
        let globalDone = skippedTasks.length;
        const notifyProgress = (delta: number) => {
            globalDone = Math.min(globalDone + delta, grandTotal);
            options.onProgress?.(globalDone, grandTotal);
        };
        if (skippedTasks.length > 0) options.onProgress?.(globalDone, grandTotal);

        let executedResults: RuleResult[] = [];

        if (workerTasks.length > 0) {
            if (workerTasks.length > parallelThreshold) {
                debug("engine", `Running analysis on ${workerTasks.length} syntax-only tasks using workers (max: ${effectiveMaxWorkers})...`);
                const result = await runAnalysisParallel(workerTasks, options.rootDir, startTime, effectiveMaxWorkers, undefined, options.onFileProgress);
                if (result.ok) {
                    executedResults = result.data.results as RuleResult[];
                    notifyProgress(workerTasks.length);
                } else {
                    return result;
                }
            } else {
                debug("engine", `Running analysis on ${workerTasks.length} syntax-only tasks locally with batching (concurrency: ${effectiveMaxWorkers})...`);
                executedResults = await executeTasksLocally(workerTasks, options.rootDir, effectiveMaxWorkers, false, options.errorCollector, undefined, undefined, true, undefined, notifyProgress, options.onFileProgress);
            }
        }

        if (typeAwareTasks.length > 0 && !options.skipTypeCheck) {
            const typeAwareFileCount = groupTasksByFile(typeAwareTasks).size;
            const chunkSize = options.typeAwareChunkSize
                ?? (typeAwareFileCount >= LARGE_TYPE_AWARE_FILE_COUNT ? LARGE_TYPE_AWARE_CHUNK_SIZE : DEFAULT_TYPE_AWARE_CHUNK_SIZE);
            const typeAwareConcurrency = getTypeAwareConcurrency(options.typeAwareConcurrency, effectiveMaxWorkers);
            const typeAwareFileConcurrency = getTypeAwareFileConcurrency(options.typeAwareFileConcurrency, effectiveMaxWorkers);
            const typeAwareResults = await executeTypeAwareTasks(
                typeAwareTasks,
                options.rootDir,
                typeAwareConcurrency,
                typeAwareFileConcurrency,
                chunkSize,
                options,
                notifyProgress,
                options.onFileProgress,
            );
            executedResults = [...executedResults, ...typeAwareResults];
        } else if (typeAwareTasks.length > 0 && options.skipTypeCheck) {
            debug("engine", `Skipping ${typeAwareTasks.length} type-aware tasks (--skip-type-check)`);
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

        if (options.cache && plan.globalHash && finalResult.results.length <= MAX_FULL_ANALYSIS_CACHE_RESULTS) {
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
        } else if (options.cache && plan.globalHash) {
            debug("engine", `Skipping full analysis cache: ${finalResult.results.length} results exceeds ${MAX_FULL_ANALYSIS_CACHE_RESULTS} result safety limit`);
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
    parserOptions?: ParserOptions,
    buildProjectContext = true,
    programRootFiles?: ReadonlyArray<string>,
    onDelta?: (delta: number) => void,
    onFileProgress?: (event: AnalysisFileProgress) => void,
): Promise<RuleResult[]> => {
    const context = useTypeAwareContext
        ? createTypeAwareAnalysisContext(rootDir, files ?? [], parserOptions, { buildProjectContext, programRootFiles })
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
                const fileStart = performance.now();
                try {
                    const batchResults = await executeBatchedTasks(fileTasks, context);
                    context.evict(filePath);
                    onDelta?.(fileTasks.length);
                    if (filePath) {
                        onFileProgress?.(buildFileProgress(filePath, fileTasks.length, batchResults, performance.now() - fileStart, useTypeAwareContext));
                    }
                    return batchResults;
                } catch (e) {
                    const msg = e instanceof Error ? e.message : String(e);
                    context.evict(filePath);
                    onDelta?.(fileTasks.length);
                    if (filePath) {
                        onFileProgress?.(buildFileProgress(filePath, fileTasks.length, [], performance.now() - fileStart, useTypeAwareContext));
                    }
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

    context.dispose();
    return results.flat().filter((r: RuleResult | null): r is RuleResult => r !== null);
};

/**
 * Splits type-aware tasks into file-chunks and processes each chunk with its
 * own scoped `ts.Program`.  After each chunk the Program object goes out of
 * scope so the GC can reclaim its memory before the next chunk starts.
 *
 * Without chunking, a single `ts.Program` for thousands of files can consume
 * 2-4 GB on large monorepos, causing an OOM crash.
 */
const executeTypeAwareTasks = async (
    tasks: ReadonlyArray<Task>,
    rootDir: string,
    concurrency: number,
    fileConcurrency: number,
    chunkSize: number,
    options: AnalysisOptions,
    onDelta?: (delta: number) => void,
    onFileProgress?: (event: AnalysisFileProgress) => void,
): Promise<RuleResult[]> => {
    const tasksByFile = groupTasksByFile(tasks);
    const fileEntries = await buildTypeAwareFileEntries(tasksByFile, rootDir, options.typeAwareChunkStrategy ?? 'dependency');

    // Build file chunks — keep all tasks for a file in the same chunk so
    // cross-file lookups (template → component TS) stay within one Program.
    const isolationMode = options.typeAwareIsolation ?? 'auto';
    const useProcessIsolation = isolationMode === 'process' ||
        (isolationMode === 'auto' && fileEntries.length >= ISOLATED_TYPE_AWARE_FILE_COUNT);
    const adaptiveChunkCap = getAdaptiveTypeAwareChunkCap();
    debug("engine", `Type-aware: ${tasks.length} tasks across ${fileEntries.length} files; requested chunk size ${chunkSize}; adaptive cap ${adaptiveChunkCap}; chunk concurrency=${concurrency}; file concurrency=${fileConcurrency}; isolation=${useProcessIsolation ? 'process' : 'in-process'}`);

    const allResults: RuleResult[] = [];
    const limit = pLimit(concurrency);

    for (const wave of buildTypeAwareChunkWaves(fileEntries, chunkSize, adaptiveChunkCap, concurrency)) {
        const waveResults = await Promise.all(wave.map(chunk => limit(async () => {
            debug("engine", `Type-aware chunk ${chunk.index}: ${chunk.files.length} files, ${chunk.programRootFiles.length} TS roots, ${chunk.tasks.length} tasks`);
            const results = useProcessIsolation
                ? await executeTypeAwareChunkInChildProcess(chunk.tasks, rootDir, chunk.files, chunk.programRootFiles, chunk.buildProjectContext, fileConcurrency, options, onFileProgress)
                : await executeTasksLocally(
                    chunk.tasks,
                    rootDir,
                    fileConcurrency,
                    true,
                    options.errorCollector,
                    chunk.files,
                    options.parserOptions,
                    chunk.buildProjectContext,
                    chunk.programRootFiles,
                    onDelta,
                    onFileProgress,
                );

            if (useProcessIsolation) {
                onDelta?.(chunk.tasks.length);
            }
            return results;
        })));

        allResults.push(...waveResults.flat());
        runGarbageCollectionHint();
    }

    return allResults;
};

const runGarbageCollectionHint = (): void => {
    const maybeGc = (globalThis as { gc?: () => void }).gc;
    if (typeof maybeGc === 'function') {
        maybeGc();
    }
};

const getTypeAwareConcurrency = (requested: number | undefined, maxWorkers: number): number => {
    const parsed = requested == null || Number.isNaN(requested)
        ? DEFAULT_TYPE_AWARE_CONCURRENCY
        : Math.floor(requested);
    return Math.max(1, Math.min(parsed, maxWorkers, ABSOLUTE_MAX_TYPE_AWARE_CONCURRENCY));
};

const getTypeAwareFileConcurrency = (requested: number | undefined, maxWorkers: number): number => {
    const parsed = requested == null || Number.isNaN(requested)
        ? DEFAULT_TYPE_AWARE_FILE_CONCURRENCY
        : Math.floor(requested);
    return Math.max(1, Math.min(parsed, maxWorkers, ABSOLUTE_MAX_TYPE_AWARE_FILE_CONCURRENCY));
};

const buildTypeAwareChunkWaves = (
    fileEntries: ReadonlyArray<[string, Task[]]>,
    requestedChunkSize: number,
    adaptiveChunkCap: number,
    concurrency: number,
): TypeAwareChunkWork[][] => {
    const waves: TypeAwareChunkWork[][] = [];
    let currentChunkSize = normalizeChunkSize(requestedChunkSize, adaptiveChunkCap);
    let lowHeapStreak = 0;
    let chunkIndex = 1;

    for (let offset = 0; offset < fileEntries.length;) {
        const wave: TypeAwareChunkWork[] = [];

        for (let slot = 0; slot < concurrency && offset < fileEntries.length; slot++) {
            const chunk = fileEntries.slice(offset, offset + currentChunkSize);
            const chunkTasks = chunk.flatMap(([, t]) => t);
            const programRootFiles = getTypeScriptRootFiles(chunkTasks);

            if (programRootFiles.length > 0) {
                wave.push({
                    index: chunkIndex,
                    tasks: chunkTasks,
                    files: chunk.map(([f]) => f),
                    programRootFiles,
                    buildProjectContext: chunkTasks.some(t => !!t.needsProjectContext),
                });
            } else {
                debug("engine", `Skipping type-aware chunk ${chunkIndex} with no TypeScript roots (${chunkTasks.length} tasks)`);
            }

            chunkIndex++;
            offset += chunk.length;
        }

        if (wave.length > 0) {
            waves.push(wave);
        }

        const next = getNextAdaptiveChunkSize(currentChunkSize, lowHeapStreak, adaptiveChunkCap);
        currentChunkSize = next.chunkSize;
        lowHeapStreak = next.lowHeapStreak;
    }

    return waves;
};

const normalizeChunkSize = (size: number, maxChunkSize: number): number => {
    if (!Number.isFinite(size)) return maxChunkSize;
    return Math.max(MIN_ADAPTIVE_TYPE_AWARE_CHUNK_SIZE, Math.min(maxChunkSize, Math.floor(size)));
};

const getAdaptiveTypeAwareChunkCap = (): number => {
    const totalGb = os.totalmem() / 1024 ** 3;
    const freeGb = os.freemem() / 1024 ** 3;
    const heapLimitGb = v8.getHeapStatistics().heap_size_limit / 1024 ** 3;
    const cpuCount = os.cpus().length;

    let cap: number;
    if (freeGb < 1.5 || totalGb < 4) {
        cap = 100;
    } else if (freeGb < 3 || totalGb < 8) {
        cap = 300;
    } else if (freeGb < 6 || totalGb < 16) {
        cap = 650;
    } else if (freeGb < 12 || totalGb < 32) {
        cap = 1000;
    } else {
        cap = 1500;
    }

    if (cpuCount <= 4) cap = Math.min(cap, 500);
    else if (cpuCount >= 12) cap = Math.min(ABSOLUTE_MAX_ADAPTIVE_TYPE_AWARE_CHUNK_SIZE, Math.round(cap * 1.2));

    if (heapLimitGb < 2) cap = Math.min(cap, 250);
    else if (heapLimitGb < 4) cap = Math.min(cap, 650);

    cap = Math.max(MIN_ADAPTIVE_TYPE_AWARE_CHUNK_SIZE, Math.min(ABSOLUTE_MAX_ADAPTIVE_TYPE_AWARE_CHUNK_SIZE, cap));
    debug(
        "engine",
        `Adaptive type-aware chunk cap: ${cap} files ` +
        `(free memory ${freeGb.toFixed(1)}GB, total memory ${totalGb.toFixed(1)}GB, V8 heap limit ${heapLimitGb.toFixed(1)}GB, CPUs ${cpuCount})`,
    );
    return cap;
};

const getNextAdaptiveChunkSize = (
    current: number,
    lowHeapStreak: number,
    maxChunkSize: number,
): { chunkSize: number; lowHeapStreak: number } => {
    const usage = process.memoryUsage();
    const heapLimit = v8.getHeapStatistics().heap_size_limit;
    const pressure = heapLimit > 0 ? usage.heapUsed / heapLimit : 0;

    if (pressure >= CRITICAL_HEAP_PRESSURE_RATIO && current > MIN_ADAPTIVE_TYPE_AWARE_CHUNK_SIZE) {
        const next = Math.max(MIN_ADAPTIVE_TYPE_AWARE_CHUNK_SIZE, Math.floor(current / 2));
        debug("engine", `Critical heap pressure after type-aware chunk (${Math.round(pressure * 100)}% of V8 heap limit); reducing chunk size to ${next}`);
        return { chunkSize: next, lowHeapStreak: 0 };
    }

    if (pressure >= HIGH_HEAP_PRESSURE_RATIO && current > MIN_ADAPTIVE_TYPE_AWARE_CHUNK_SIZE) {
        const next = Math.max(MIN_ADAPTIVE_TYPE_AWARE_CHUNK_SIZE, Math.floor(current * 0.8));
        debug("engine", `High heap pressure after type-aware chunk (${Math.round(pressure * 100)}% of V8 heap limit); reducing chunk size to ${next}`);
        return { chunkSize: next, lowHeapStreak: 0 };
    }

    if (pressure <= LOW_HEAP_PRESSURE_RATIO && current < maxChunkSize) {
        const nextLowHeapStreak = lowHeapStreak + 1;
        if (nextLowHeapStreak < ADAPTIVE_GROWTH_STREAK) {
            return { chunkSize: current, lowHeapStreak: nextLowHeapStreak };
        }

        const next = Math.min(maxChunkSize, current + Math.max(10, Math.floor(current * 0.1)));
        debug("engine", `Sustained low heap pressure after type-aware chunk (${Math.round(pressure * 100)}% of V8 heap limit); increasing chunk size to ${next}`);
        return { chunkSize: next, lowHeapStreak: 0 };
    }

    return { chunkSize: current, lowHeapStreak: 0 };
};

const getTypeScriptRootFiles = (tasks: ReadonlyArray<Task>): string[] => {
    const roots = new Set<string>();
    for (const task of tasks) {
        const tsPath = task.inputs.typescript.path;
        if ((tsPath.endsWith('.ts') || tsPath.endsWith('.tsx')) && !tsPath.endsWith('.d.ts')) {
            roots.add(tsPath);
        }
    }
    return [...roots];
};

type TypeAwareChunkStrategy = NonNullable<AnalysisOptions['typeAwareChunkStrategy']>;

const buildTypeAwareFileEntries = async (
    tasksByFile: ReadonlyMap<string, Task[]>,
    rootDir: string,
    strategy: TypeAwareChunkStrategy,
): Promise<Array<[string, Task[]]>> => {
    const entries = Array.from(tasksByFile.entries());
    if (strategy === 'simple') {
        debug("engine", `Type-aware chunk ordering: simple path sort for ${entries.length} files`);
        return sortFileEntries(entries);
    }

    debug("engine", `Type-aware chunk ordering: dependency pre-pass for ${entries.length} files`);
    const start = performance.now();
    const dependencyEntries = await buildDependencyAwareFileEntries(entries, rootDir, start + DEPENDENCY_GROUPING_TIMEOUT_MS);

    if (!dependencyEntries) {
        debug("engine", `Dependency chunk ordering exceeded ${DEPENDENCY_GROUPING_TIMEOUT_MS}ms; falling back to simple path sort`);
        return sortFileEntries(entries);
    }

    debug("engine", `Dependency chunk ordering complete in ${(performance.now() - start).toFixed(1)}ms`);
    return dependencyEntries;
};

const buildDependencyAwareFileEntries = async (
    entries: ReadonlyArray<[string, Task[]]>,
    rootDir: string,
    deadlineMs: number,
): Promise<Array<[string, Task[]]> | null> => {
    const groups = new Map<string, Array<[string, Task[]]>>();
    const limit = pLimit(DEPENDENCY_GROUPING_CONCURRENCY);

    for (let i = 0; i < entries.length; i += DEPENDENCY_GROUPING_CONCURRENCY) {
        if (performance.now() > deadlineMs) return null;
        const batch = entries.slice(i, i + DEPENDENCY_GROUPING_CONCURRENCY);
        await Promise.all(batch.map(entry => limit(async () => {
            const [filePath, tasks] = entry;
            const rootFile = getTypeScriptRootFiles(tasks)[0] ?? filePath;
            const key = await getDependencyGroupKey(rootFile, rootDir);
            const group = groups.get(key) ?? [];
            group.push(entry);
            groups.set(key, group);
        })));
    }

    return [...groups.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .flatMap(([, group]) => sortFileEntries(group));
};

const sortFileEntries = (entries: ReadonlyArray<[string, Task[]]>): Array<[string, Task[]]> => {
    return [...entries].sort(([a], [b]) => a.localeCompare(b));
};

const getDependencyGroupKey = async (filePath: string, rootDir: string): Promise<string> => {
    const dir = dirname(filePath);
    try {
        const source = await readFile(filePath, 'utf8');
        const firstLocalImport = findFirstLocalImport(source);
        if (!firstLocalImport) return dir;
        return join(dir, firstLocalImport.split('/')[0] ?? '');
    } catch {
        return dirname(join(rootDir, filePath));
    }
};

const findFirstLocalImport = (source: string): string | null => {
    const importRe = /\b(?:import|export)\b[^'"]*['"](\.{1,2}\/[^'"]+)['"]/g;
    const match = importRe.exec(source);
    return match?.[1] ?? null;
};

const executeTypeAwareChunkInChildProcess = async (
    tasks: ReadonlyArray<Task>,
    rootDir: string,
    files: ReadonlyArray<string>,
    programRootFiles: ReadonlyArray<string>,
    buildProjectContext: boolean,
    fileConcurrency: number,
    options: AnalysisOptions,
    onFileProgress?: (event: AnalysisFileProgress) => void,
): Promise<RuleResult[]> => {
    const workerPath = await resolveTypeAwareWorkerPath();
    if (!workerPath) {
        debug("engine", "Type-aware child worker not found; falling back to in-process execution");
        return executeTasksLocally(
            tasks,
            rootDir,
            fileConcurrency,
            true,
            options.errorCollector,
            files,
            options.parserOptions,
            buildProjectContext,
            programRootFiles,
            undefined,
            onFileProgress,
        );
    }

    return new Promise<RuleResult[]>((resolve, reject) => {
        const child = fork(workerPath, [], {
            cwd: rootDir,
            execArgv: [],
            stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
        });
        let settled = false;
        const timeout = setTimeout(() => {
            if (settled) return;
            settled = true;
            child.kill();
            reject(new Error(`Type-aware child process timed out after ${TYPE_AWARE_CHILD_TIMEOUT_MS / 1000}s`));
        }, TYPE_AWARE_CHILD_TIMEOUT_MS);

        child.stdout?.on('data', (data) => debug("engine", `[type-aware-child] ${String(data).trim()}`));
        child.stderr?.on('data', (data) => debug("engine", `[type-aware-child:stderr] ${String(data).trim()}`));

        child.on('message', (message: unknown) => {
            if (isAnalysisFileProgress(message)) {
                onFileProgress?.(message);
                return;
            }

            if (isTypeAwareChildComplete(message)) {
                if (settled) return;
                settled = true;
                clearTimeout(timeout);
                resolve(message.results);
                return;
            }

            if (isTypeAwareChildError(message)) {
                if (settled) return;
                settled = true;
                clearTimeout(timeout);
                reject(new Error(message.error));
            }
        });

        child.on('error', (error) => {
            if (settled) return;
            settled = true;
            clearTimeout(timeout);
            reject(error);
        });

        child.on('exit', (code) => {
            if (settled) return;
            settled = true;
            clearTimeout(timeout);
            reject(new Error(`Type-aware child process exited before completion with code ${code}`));
        });

        child.send({
            rootDir,
            tasks,
            files,
            programRootFiles,
            parserOptions: options.parserOptions,
            buildProjectContext,
            fileConcurrency,
        });
    });
};

const resolveTypeAwareWorkerPath = async (): Promise<string | null> => {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);

    try {
        const req = createRequire(import.meta.url);
        const workerFromRules = req.resolve('@ngcompass/rules/type-aware-worker');
        if (existsSync(workerFromRules)) return workerFromRules;
    } catch {
        // Fall back to local workspace/package layout below.
    }

    const candidates = [
        join(__dirname, "..", "..", "rules", "dist", "type-aware-worker.js"),
        join(__dirname, "..", "..", "rules", "dist", "type-aware-worker.cjs"),
    ];

    for (const candidate of candidates) {
        if (existsSync(candidate)) return candidate;
    }

    return null;
};

const isAnalysisFileProgress = (message: unknown): message is AnalysisFileProgress => {
    if (!message || typeof message !== 'object') return false;
    const value = message as Partial<AnalysisFileProgress> & { kind?: unknown };
    return value.kind === 'file-progress' &&
        typeof value.filePath === 'string' &&
        typeof value.taskCount === 'number' &&
        typeof value.issueCount === 'number' &&
        typeof value.errorCount === 'number' &&
        typeof value.warningCount === 'number' &&
        typeof value.duration === 'number';
};

const isTypeAwareChildComplete = (message: unknown): message is { kind: 'complete'; results: RuleResult[] } => {
    return !!message &&
        typeof message === 'object' &&
        (message as { kind?: unknown }).kind === 'complete' &&
        Array.isArray((message as { results?: unknown }).results);
};

const isTypeAwareChildError = (message: unknown): message is { kind: 'error'; error: string } => {
    return !!message &&
        typeof message === 'object' &&
        (message as { kind?: unknown }).kind === 'error' &&
        typeof (message as { error?: unknown }).error === 'string';
};

const buildFileProgress = (
    filePath: string,
    taskCount: number,
    results: ReadonlyArray<RuleResult>,
    duration: number,
    typeAware?: boolean,
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
        typeAware,
    };
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

