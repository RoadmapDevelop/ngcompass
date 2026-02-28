/**
 * Execution Plan Builder
 *
 * Builds an execution plan from discovered files and resolved rules.
 * Produces both task-centric and file-centric representations plus indexes.
 */

import type {
    ExecutionPlanOptions,
    ExecutionPlanOutput,
    FileAnalysisUnit,
    Task,
    RuleTask,
    Result,
    FileType,
} from "./types.js";
import { Ok, Err } from "./types.js";
import { debug, time, timeLog } from "@ngcompass/common";
import { detectFileType } from "./file-type.js";
import { filterCachedTasks } from "./incremental.js";
import { buildTasksForFileTaskCentric, type TaskBuilderContext } from "./task-builder.js";
import { createInfrastructureError, InfrastructureErrorCollector } from "@ngcompass/common";
import { buildIndexes } from "./indexes.js";
import { serializePlan, deserializePlan } from "./serialize.js";
import { initHasher } from "@ngcompass/cache";
import { warmupHashCache, calculateGlobalHash, calculateFileHash } from "./hashing.js";

/**
 * Builds complete execution plan with indexes and optional caching.
 *
 * @param options - Build options (files + rules)
 * @returns ExecutionPlanOutput with tasks[] + plan + indexes
 */
export const buildExecutionPlan = async (
    options: ExecutionPlanOptions
): Promise<Result<ExecutionPlanOutput>> => {
    const timerLabel = "buildExecutionPlan";
    time(timerLabel);

    try {
        await initHasher();

        const { files, rules } = options;
        debug("planner", `Building execution plan for ${files.length} files and ${rules.size} rules`);

        const validationError = validateBuildInputs(files, rules);
        if (validationError) {
            return Err(validationError);
        }

        const context = createTaskBuilderContext();
        const fileTypeCache = new Map<string, FileType>();

        const errorCollector = new InfrastructureErrorCollector();
        const cachedPlan = await tryLoadPlanFromCache(options, context, errorCollector);

        if (!cachedPlan && options.cache) {
            debug("planner", "Warming up hash cache from metadata index...");
            const start = performance.now();
            await warmupHashCache(
                options.files as string[],
                options.cache.metas,
                context.hashCache!
            );
            debug("planner", `Metadata warmup took ${(performance.now() - start).toFixed(2)}ms`);
        }

        let allTasks: ReadonlyArray<Task>;

        if (cachedPlan && cachedPlan.precomputedAnalysis) {
            // Fast path: full analysis result is cached, skip everything
            timeLog(timerLabel, "planner", "Full analysis cached — returning precomputed result");
            return Ok(cachedPlan);
        }

        if (cachedPlan) {
            timeLog(timerLabel, "planner", "Execution plan loaded from cache");
            allTasks = cachedPlan.tasks;
        } else {
            debug("planner", "Building tasks...");
            allTasks = await buildAllTasks(files, rules, context, fileTypeCache);

            // Save full plan to cache
            if (options.cache && context.globalHash) {
                debug("planner", "Converting all tasks to full plan for cache...");
                const fullPlan = convertTasksToPlan(allTasks, rules, fileTypeCache);
                const fullIndexes = buildIndexes(fullPlan, allTasks);
                const fullOutput: ExecutionPlanOutput = {
                    tasks: allTasks,
                    plan: fullPlan,
                    indexes: fullIndexes,
                    skippedTasks: [],
                    globalHash: context.globalHash
                };
                await savePlanToCacheIfEnabled(options, context, fullOutput);
            }
        }

        let tasks = allTasks;
        let skippedTasks: ReadonlyArray<Task> = [];
        let cachedResults: ReadonlyMap<string, unknown> | undefined;

        if (options.cache) {
            debug("planner", "Filtering cached tasks...");
            const incremental = await filterCachedTasks(
                allTasks,
                options.cache.results,
                options.incremental
            );
            tasks = incremental.tasks;
            skippedTasks = incremental.skippedTasks;
            cachedResults = incremental.cachedResults;
        }

        debug("planner", "Converting tasks to file-centric plan...");
        const plan = convertTasksToPlan(tasks, rules, fileTypeCache);

        debug("planner", `Building indexes for ${tasks.length} tasks...`);
        const indexes = buildIndexes(plan, tasks);

        const output: ExecutionPlanOutput = {
            tasks,
            plan,
            indexes,
            skippedTasks,
            cachedResults,
            globalHash: context.globalHash
        };
        // Note: We do NOT save the filtered plan to the main plan cache, as it is state-dependent.
        // The main cache stores the full plan.

        timeLog(timerLabel, "planner", "Execution plan built");
        return Ok(output);
    } catch (error) {
        const err = error as Error;
        debug("planner", `Error building plan: ${err.message}`);
        return Err(new Error(`Failed to build execution plan: ${err.message}`));
    }
};



/**
 * Gets execution plan summary (for logging).
 *
 * @param output - Execution plan output
 * @returns Summary string
 */
export const getExecutionPlanSummary = (output: ExecutionPlanOutput): string => {
    const { stats } = output.indexes;
    const lines: string[] = [];

    lines.push("--- Execution Plan Summary ---");
    lines.push(`Total files: ${stats.totalFiles}`);
    lines.push(`Total tasks: ${stats.totalTasks}`);
    lines.push(`Avg tasks per file: ${stats.avgTasksPerFile.toFixed(1)}`);
    lines.push(`Files with templates: ${stats.filesWithTemplates}`);
    lines.push(`Files with styles: ${stats.filesWithStyles}`);
    lines.push(`Files with specs: ${stats.filesWithSpecs}`);
    lines.push("");

    const { tasksBySeverity } = output.indexes;
    lines.push("Tasks by severity:");
    lines.push(`  Critical: ${tasksBySeverity.critical}`);
    lines.push(`  High: ${tasksBySeverity.high}`);
    lines.push(`  Moderate: ${tasksBySeverity.moderate}`);
    lines.push(`  Low: ${tasksBySeverity.low}`);
    lines.push(`  Info: ${tasksBySeverity.info}`);

    return lines.join("\n");
};



/**
 * Validates top-level inputs for plan build.
 *
 * @param files - Discovered files
 * @param rules - Resolved rules
 * @returns Error if invalid, otherwise null
 */
const validateBuildInputs = (
    files: ReadonlyArray<string>,
    rules: ReadonlyMap<string, any>
): Error | null => {
    if (files.length === 0) return new Error("No files to analyze");
    if (rules.size === 0) return new Error("No rules configured");
    return null;
};

/**
 * Creates a context object used by the task builder to share caches.
 *
 * @returns TaskBuilderContext
 */
const createTaskBuilderContext = (): TaskBuilderContext => {
    return {
        hashCache: new Map(),
        resourceCache: new Map(),
        directoryCache: new Map(),
    };
};

/**
 * Attempts to load an execution plan from cache if enabled.
 *
 * @param options - Execution plan options
 * @param context - Task builder context (used for global hash caching)
 * @param fileTypeCache - File type cache (reserved for future use)
 * @returns Cached ExecutionPlanOutput or null
 */
const tryLoadPlanFromCache = async (
    options: ExecutionPlanOptions,
    context: TaskBuilderContext,
    errorCollector?: InfrastructureErrorCollector
): Promise<ExecutionPlanOutput | null> => {
    if (!options.cache) return null;

    const { files, rules } = options;

    // Pass CacheKeyContext so tool/parser/rule-set version changes invalidate the global hash
    const globalHash = await calculateGlobalHash(files, rules, context.hashCache!, options.cacheKeyCtx);
    context.globalHash = globalHash;

    // Check precomputed analysis first (Short-circuit)
    const analysisCache = options.cache.analysis;
    const precomputedAnalysis = await analysisCache.get(globalHash);

    if (precomputedAnalysis) {
        if (options.debug) {
            debug("planner", "Analysis results cached (Short-circuit enabled)");
        }
        return {
            tasks: [],
            plan: {},
            indexes: {
                stats: {
                    totalFiles: 0,
                    totalTasks: 0,
                    avgTasksPerFile: 0,
                    filesWithTemplates: 0,
                    filesWithStyles: 0,
                    filesWithSpecs: 0
                },
                tasksBySeverity: {
                    critical: 0,
                    high: 0,
                    moderate: 0,
                    low: 0,
                    info: 0
                }
            },
            skippedTasks: [],
            globalHash,
            precomputedAnalysis: precomputedAnalysis as any
        } as unknown as ExecutionPlanOutput;
    }

    const tCacheStart = performance.now();
    const cachedData = await options.cache.plans.get(globalHash);
    const tIOEnd = performance.now();

    if (!cachedData) return null;

    const planSize = JSON.stringify(cachedData).length;

    const tDeserStart = performance.now();
    let output: ExecutionPlanOutput;
    try {
        output = cachedData.v === 1 ? deserializePlan(cachedData) : (cachedData as ExecutionPlanOutput);
    } catch (deserErr) {
        // Cache corruption: delete the bad entry and trigger a cold rebuild.
        // This self-heals without user intervention (same pattern as the AST cache).
        debug("planner", `Plan cache deserialization failed — deleting corrupted entry and rebuilding`);
        try {
            await options.cache.plans.delete?.(globalHash);
        } catch { /* best-effort delete */ }

        if (errorCollector) {
            errorCollector.record(createInfrastructureError('CacheCorruption', {
                cause: deserErr instanceof Error ? deserErr.message : String(deserErr),
                phase: 'planner',
                recoverable: true,
                details: { globalHash },
            }));
        }
        return null;
    }
    const tDeserEnd = performance.now();

    if (options.debug) {
        debug("planner", "Plan cache HIT");
        debug("planner", `  Size:   ${(planSize / 1024).toFixed(1)}KB`);
        debug("planner", `  IO:     ${(tIOEnd - tCacheStart).toFixed(2)}ms`);
        debug("planner", `  Deser:  ${(tDeserEnd - tDeserStart).toFixed(2)}ms`);
    }

    return {
        ...output,
        globalHash, // Ensure globalHash is passed through
    };
};

/**
 * Saves an execution plan to cache if enabled.
 *
 * @param options - Execution plan options
 * @param context - Task builder context (contains global hash)
 * @param output - Execution plan output to persist
 */
const savePlanToCacheIfEnabled = async (
    options: ExecutionPlanOptions,
    context: TaskBuilderContext,
    output: ExecutionPlanOutput
): Promise<void> => {
    if (!options.cache) return;
    if (!context.globalHash) return;

    const cacheSaveStart = performance.now();
    debug("planner", "Saving execution plan to cache...");

    const compact = serializePlan(output);
    await options.cache.plans.set(context.globalHash, compact);

    const cacheSaveTime = performance.now() - cacheSaveStart;
    debug("planner", `  Plan cache saved in ${cacheSaveTime.toFixed(2)}ms`);
};

/**
 * Collects applicable rules for a file based on tasks generated for that file.
 *
 * @param tasks - Tasks generated for a file
 * @param rules - All resolved rules
 * @returns List of rules applicable to the file
 */
const collectApplicableRulesFromTasks = (
    tasks: ReadonlyArray<Task>,
    rules: ReadonlyMap<string, any>
): any[] => {
    const ruleNamesInFile = new Set(tasks.map((t) => t.ruleName));
    const applicable: any[] = [];

    for (const ruleName of ruleNamesInFile) {
        const rule = rules.get(ruleName);
        if (rule) applicable.push(rule);
    }

    return applicable;
};

/**
 * Calculates file-level hash using representative task inputs.
 *
 * @param tasks - Tasks for a file
 * @param applicableRules - Rules applicable to the file
 * @returns File-level content hash
 */
const calculateHashFromTasks = (tasks: ReadonlyArray<Task>, applicableRules: any[]): string => {
    if (tasks.length === 0) return "";
    return calculateFileHash((tasks[0] as any).inputs, applicableRules);
};

/**
 * Builds all tasks for all files.
 *
 * @param files - Discovered files
 * @param rules - Resolved rules
 * @param context - Optional context for caching
 * @param fileTypeCache - Optional cache for file types
 * @returns Array of all tasks
 */
const buildAllTasks = async (
    files: ReadonlyArray<string>,
    rules: ReadonlyMap<string, any>,
    context?: TaskBuilderContext,
    fileTypeCache?: Map<string, FileType>
): Promise<ReadonlyArray<Task>> => {
    const PARALLEL_THRESHOLD = 10000;
    const WORKER_COUNT = 4;

    if (files.length >= PARALLEL_THRESHOLD) {
        const tasks = await tryBuildAllTasksParallel(files, rules, fileTypeCache, WORKER_COUNT);
        if (tasks) return tasks;
    }

    return buildAllTasksSequential(files, rules, context, fileTypeCache);
};

/**
 * Builds all tasks sequentially.
 *
 * @param files - Discovered files
 * @param rules - Resolved rules
 * @param context - Task builder context
 * @param fileTypeCache - File type cache
 * @returns Array of tasks
 */
const buildAllTasksSequential = async (
    files: ReadonlyArray<string>,
    rules: ReadonlyMap<string, any>,
    context?: TaskBuilderContext,
    fileTypeCache?: Map<string, FileType>
): Promise<Task[]> => {
    const allTasks: Task[] = [];

    for (const file of files) {
        const fileType = getOrDetectFileType(file, fileTypeCache);
        const fileTasks = await buildTasksForFileTaskCentric(file, fileType, rules, context);
        allTasks.push(...fileTasks);
    }

    return allTasks;
};

/**
 * Attempts to build all tasks in parallel using worker threads.
 *
 * @param files - Discovered files
 * @param rules - Resolved rules
 * @param fileTypeCache - File type cache
 * @param workerCount - Number of workers
 * @returns Tasks array if successful, otherwise null
 */
const tryBuildAllTasksParallel = async (
    files: ReadonlyArray<string>,
    rules: ReadonlyMap<string, any>,
    fileTypeCache: Map<string, FileType> | undefined,
    workerCount: number
): Promise<Task[] | null> => {
    debug("planner", `Parallelizing task discovery across ${workerCount} workers...`);

    try {
        const workerPath = await resolveWorkerPath();
        if (!workerPath) {
            debug("planner", "Worker script not found, falling back to sequential execution");
            return null;
        }

        debug("planner", `Using worker: ${workerPath}`);

        const chunks = splitIntoChunks(files, workerCount);
        debug("planner", `Split ${files.length} files into ${chunks.length} chunks`);

        const tasks = await runWorkerChunks(chunks, workerPath, rules, fileTypeCache);
        debug("planner", `Workers completed. Generated ${tasks.length} tasks.`);
        return tasks;
    } catch (error) {
        debug("planner", `Parallel execution failed, falling back to sequential: ${String(error)}`);
        return null;
    }
};

/**
 * Resolves a worker script path.
 *
 * @returns Worker path or null if not found
 */
const resolveWorkerPath = async (): Promise<string | null> => {
    const { Worker } = await import("node:worker_threads");
    void Worker;

    const { fileURLToPath } = await import("node:url");
    const { dirname, join } = await import("node:path");
    const { existsSync } = await import("node:fs");

    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);

    const candidates = [
        join(__dirname, "worker.js"),
        join(__dirname, "worker.cjs"),
        join(__dirname, "worker.ts"),
        join(__dirname, "planner", "worker.js"),
        join(__dirname, "planner", "worker.cjs"),
    ];

    for (const candidate of candidates) {
        if (existsSync(candidate)) return candidate;
    }

    return null;
};

/**
 * Splits an array into approximately equal chunks.
 *
 * @param items - Items to split
 * @param chunkCount - Number of chunks
 * @returns Chunked arrays
 */
const splitIntoChunks = (items: ReadonlyArray<string>, chunkCount: number): string[][] => {
    const size = Math.ceil(items.length / chunkCount);
    const chunks: string[][] = [];

    for (let i = 0; i < items.length; i += size) {
        chunks.push(items.slice(i, i + size));
    }

    return chunks;
};

/**
 * Runs worker threads over file chunks and collects all tasks.
 *
 * @param chunks - File chunks
 * @param workerPath - Worker script path
 * @param rules - Resolved rules
 * @param fileTypeCache - File type cache
 * @returns Flattened task list
 */
const runWorkerChunks = async (
    chunks: ReadonlyArray<string[]>,
    workerPath: string,
    rules: ReadonlyMap<string, any>,
    fileTypeCache?: Map<string, FileType>
): Promise<Task[]> => {
    const { Worker } = await import("node:worker_threads");

    const workerPromises = chunks.map((chunk, index) => {
        return new Promise<Task[]>((resolve, reject) => {
            const worker = new Worker(workerPath, {
                workerData: {
                    files: chunk,
                    rules,
                    fileTypeCache,
                },
            });

            worker.on("message", (message: { tasks: Task[] }) => resolve(message.tasks));
            worker.on("error", reject);
            worker.on("exit", (code) => {
                if (code !== 0) reject(new Error(`Worker ${index} stopped with exit code ${code}`));
            });
        });
    });

    const results = await Promise.all(workerPromises);
    return results.flat();
};

/**
 * Gets a file type from cache or detects and caches it.
 *
 * @param filePath - File path
 * @param cache - Cache map
 * @returns File type
 */
const getOrDetectFileType = (filePath: string, cache?: Map<string, FileType>): FileType => {
    if (!cache) return detectFileType(filePath);

    const cached = cache.get(filePath);
    if (cached) return cached;

    const detected = detectFileType(filePath);
    cache.set(filePath, detected);
    return detected;
};

/**
 * Converts flat tasks array to file-centric plan (backward compatibility).
 *
 * @param tasks - All tasks
 * @param rules - Resolved rules (for hash calculation)
 * @param fileTypeCache - Optional file type cache
 * @returns File-centric plan
 */
const convertTasksToPlan = (
    tasks: ReadonlyArray<Task>,
    rules: ReadonlyMap<string, any>,
    fileTypeCache?: Map<string, FileType>
): Record<string, FileAnalysisUnit> => {
    const tasksByFile = groupTasksByFile(tasks);
    const plan: Record<string, FileAnalysisUnit> = {};

    for (const [filePath, fileTasks] of tasksByFile) {
        const fileType = getOrDetectFileType(filePath, fileTypeCache);

        const applicableRules = collectApplicableRulesFromTasks(fileTasks, rules);
        const hash = calculateHashFromTasks(fileTasks, applicableRules);

        const ruleTasks: RuleTask[] = fileTasks.map((task) => ({
            ruleName: task.ruleName,
            severity: task.severity,
            options: task.options,
            cacheKey: task.taskId,
            inputs: task.inputs,
        }));

        plan[filePath] = {
            file: { path: filePath, type: fileType, hash },
            tasks: ruleTasks,
        };
    }

    return plan;
};

/**
 * Groups tasks by file path.
 *
 * @param tasks - Flat list of tasks
 * @returns Map keyed by file path
 */
const groupTasksByFile = (tasks: ReadonlyArray<Task>): Map<string, Task[]> => {
    const map = new Map<string, Task[]>();

    for (const task of tasks) {
        const list = map.get(task.filePath);
        if (list) {
            list.push(task);
        } else {
            map.set(task.filePath, [task]);
        }
    }

    return map;
};

