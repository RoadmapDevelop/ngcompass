/**
 * Execution Plan Builder
 *
 * Main pipeline for building execution plan from discovered files + resolved rules.
 * Orchestrates all Phase 1.75 components.
 */

import type {
    ExecutionPlanOptions,
    ExecutionPlanOutput,
    FileAnalysisUnit,
    Task,
    Result,
    FileType,
} from './types.js';
import { Ok, Err } from './types.js';
import { debug, time, timeLog } from '@ngcompass/common';
import { detectFileType } from './file-type.js';
import { buildTasksForFile, type TaskBuilderContext } from './task-builder.js';
import { calculateFileHash, initHasher, calculateGlobalHash } from './hashing.js';
import { buildIndexes } from './indexes.js';
import { serializePlan, deserializePlan } from './serialize.js';

/**
 * Builds complete execution plan with indexes (task-centric + file-centric).
 *
 * Enhanced Phase 1.75 pipeline (Task-Centric Migration):
 * 1. For each rule, for each file (task-centric loop order)
 * 2. Build Task with content-based taskId
 * 3. Convert tasks[] → plan (file-centric view for backward compat)
 * 4. Build comprehensive indexes (file-level + task-level)
 *
 * @param options - Build options (files + rules)
 * @returns ExecutionPlanOutput with tasks[] + plan + indexes
 */
export const buildExecutionPlan = async (
    options: ExecutionPlanOptions
): Promise<Result<ExecutionPlanOutput>> => {
    const timerLabel = 'buildExecutionPlan';
    time(timerLabel);

    try {
        // Initialize WASM hasher
        await initHasher();

        const { files, rules } = options;
        debug('planner', `Building execution plan for ${files.length} files and ${rules.size} rules`);

        // Validate inputs
        if (files.length === 0) {
            return Err(new Error('No files to analyze'));
        }

        if (rules.size === 0) {
            return Err(new Error('No rules configured'));
        }

        // Initialize caches for P0 performance fixes
        const context: TaskBuilderContext = {
            hashCache: new Map(),
            resourceCache: new Map(),
        };
        const fileTypeCache = new Map<string, FileType>();

        // Phase 1-4 Optimizations: TESTING
        // Phase 1: DISABLED (added ~2s overhead)
        // Phase 2: DISABLED (neutral, no benefit)
        // Phase 3/4: TESTING - Disable fast hashing to see if it helps

        // Simple plan cache check (if enabled)
        if (options.cache) {
            // Use ORIGINAL hash calculation (not the "fast" version)
            const globalHash = calculateGlobalHash(files, rules, context.hashCache!);

            // Try to load from cache with detailed timing
            const tCacheStart = performance.now();
            const cachedData = await options.cache.plans.get(globalHash);
            const tIOEnd = performance.now();

            if (cachedData) {
                // Estimate plan size (rough approximation)
                const planSize = JSON.stringify(cachedData).length;

                const tDeserStart = performance.now();
                let output: ExecutionPlanOutput;

                // Check for compact format (v1)
                if ((cachedData as any).v === 1) {
                    output = deserializePlan(cachedData as any);
                } else {
                    output = cachedData as ExecutionPlanOutput;
                }
                const tDeserEnd = performance.now();

                // Index reconstruction is part of deserializePlan, measure total
                const tIndexEnd = performance.now();

                if (options.debug) {
                    console.log(`  [DEBUG] Plan cache HIT`);
                    console.log(`    Size:   ${(planSize / 1024).toFixed(1)}KB`);
                    console.log(`    IO:     ${(tIOEnd - tCacheStart).toFixed(2)}ms`);
                    console.log(`    Deser:  ${(tDeserEnd - tDeserStart).toFixed(2)}ms`);
                    console.log(`    Index:  ${(tIndexEnd - tDeserEnd).toFixed(2)}ms`);
                    console.log(`    Total:  ${(tIndexEnd - tCacheStart).toFixed(2)}ms`);
                }
                timeLog(timerLabel, 'planner', 'Execution plan loaded from cache');
                return Ok(output);
            }

            // Mark for saving later
            (context as any)._globalHash = globalHash;
        }

        // Build tasks array (file-centric order: files → rules)
        // Phase 2: Uses worker pool for large projects (100+ files)
        debug('planner', 'Building tasks...');
        const tasks = await buildAllTasks(files, rules, context, fileTypeCache);

        // Convert tasks → plan (file-centric view for backward compatibility)
        debug('planner', 'Converting tasks to file-centric plan...');
        const plan = convertTasksToPlan(tasks, rules, fileTypeCache);

        // Build comprehensive indexes (file-level + task-level)
        debug('planner', `Building indexes for ${tasks.length} tasks...`);
        const indexes = buildIndexes(plan, tasks);

        const output: ExecutionPlanOutput = {
            tasks,
            plan,
            indexes,
        };

        // Save to cache if enabled (Phase 3: non-blocking serialization)
        if (options.cache && (context as any)._globalHash) {
            const cacheSaveStart = performance.now();
            debug('planner', 'Saving execution plan to cache (non-blocking)...');

            // Serialize to compact format for M2 (sub-150ms load)
            const compact = serializePlan(output);

            await options.cache.plans.set((context as any)._globalHash, compact);
            const cacheSaveTime = performance.now() - cacheSaveStart;
            debug('planner', `  Plan cache saved in ${cacheSaveTime.toFixed(2)}ms`);
        }

        timeLog(timerLabel, 'planner', 'Execution plan built');

        return Ok(output);
    } catch (error) {
        const err = error as Error;
        debug('planner', `Error building plan: ${err.message}`);
        return Err(new Error(`Failed to build execution plan: ${err.message}`));
    }
};

/**
 * Builds a single file analysis unit.
 *
 * @param filePath - File path
 * @param rules - All resolved rules
 * @returns FileAnalysisUnit or null if no applicable rules
 */
const buildFileAnalysisUnit = async (
    filePath: string,
    rules: ReadonlyMap<string, any>
): Promise<FileAnalysisUnit | null> => {
    // Initialize WASM hasher
    await initHasher();

    // Detect file type
    const fileType = detectFileType(filePath);

    // Build tasks for this file
    const tasks = buildTasksForFile(filePath, fileType, rules);

    // Skip files with no applicable tasks
    if (tasks.length === 0) {
        debug('planner', `  - ${filePath}: Skipped (no applicable rules)`);
        return null;
    }

    debug('planner', `  - ${filePath}: ${fileType} (${tasks.length} tasks)`);

    // Get applicable rules for hash calculation
    const applicableRules = Array.from(rules.values()).filter((rule) =>
        tasks.some((task) => task.ruleName === rule.name)
    );

    // Calculate content hash
    // Use first task's inputs as representative (they should all have same resources)
    const hash = tasks.length > 0 ? calculateFileHash(tasks[0].inputs, applicableRules) : '';

    return {
        file: {
            path: filePath,
            type: fileType,
            hash,
        },
        tasks,
    };
};

/**
 * Builds execution plan for a single file (useful for testing).
 *
 * @param filePath - File path
 * @param rules - All resolved rules
 * @returns FileAnalysisUnit or null
 */
export const buildFileUnit = async (
    filePath: string,
    rules: ReadonlyMap<string, any>
): Promise<FileAnalysisUnit | null> => {
    return buildFileAnalysisUnit(filePath, rules);
};

/**
 * Validates execution plan output.
 *
 * @param output - Execution plan output
 * @returns true if valid
 */
export const validateExecutionPlan = (output: ExecutionPlanOutput): boolean => {
    // Check plan exists
    if (!output.plan || Object.keys(output.plan).length === 0) {
        return false;
    }

    // Check indexes exist
    if (!output.indexes) {
        return false;
    }

    // Check stats match
    const planFileCount = Object.keys(output.plan).length;
    const statsFileCount = output.indexes.stats.totalFiles;

    if (planFileCount !== statsFileCount) {
        return false;
    }

    return true;
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

    lines.push('--- Execution Plan Summary ---');
    lines.push(`Total files: ${stats.totalFiles}`);
    lines.push(`Total tasks: ${stats.totalTasks}`);
    lines.push(`Avg tasks per file: ${stats.avgTasksPerFile.toFixed(1)}`);
    lines.push(`Files with templates: ${stats.filesWithTemplates}`);
    lines.push(`Files with styles: ${stats.filesWithStyles}`);
    lines.push(`Files with specs: ${stats.filesWithSpecs}`);
    lines.push('');

    // Group by severity
    const { tasksBySeverity } = output.indexes;
    lines.push('Tasks by severity:');
    lines.push(`  Critical: ${tasksBySeverity.critical}`);
    lines.push(`  High: ${tasksBySeverity.high}`);
    lines.push(`  Moderate: ${tasksBySeverity.moderate}`);
    lines.push(`  Low: ${tasksBySeverity.low}`);
    lines.push(`  Info: ${tasksBySeverity.info}`);

    return lines.join('\n');
};

// ==============================================================================
// TASK-CENTRIC BUILDERS (Phase 1.75)
// ==============================================================================

/**
 * Builds all tasks for all files.
 * Simple, synchronous implementation - fastest for our use case.
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
    // Phase 1.95: Parallelize for large projects
    // Threshold based on benchmark (overhead of spawning workers vs speedup)
    const PARALLEL_THRESHOLD = 500; // Lowered for testing, user has 3600
    const WORKER_COUNT = 4;

    if (files.length >= PARALLEL_THRESHOLD) {
        debug('planner', `Parallelizing task discovery across ${WORKER_COUNT} workers...`);

        try {
            // Lazy import worker_threads to avoid overhead if not needed
            const { Worker } = await import('node:worker_threads');
            const { fileURLToPath } = await import('node:url');
            const { dirname, join } = await import('node:path');

            // Resolve worker path
            const __filename = fileURLToPath(import.meta.url);
            const __dirname = dirname(__filename);
            const { existsSync } = await import('node:fs');

            // Potential paths to check
            const candidates = [
                join(__dirname, 'worker.js'),
                join(__dirname, 'worker.cjs'),
                join(__dirname, 'worker.ts'), // Dev
                join(__dirname, 'planner', 'worker.js'),
                join(__dirname, 'planner', 'worker.cjs'),
            ];

            let workerPath = '';
            for (const candidate of candidates) {
                if (existsSync(candidate)) {
                    workerPath = candidate;
                    break;
                }
            }

            if (!workerPath) {
                // If we can't find the worker, log warning and fall back to sequential
                debug('planner', 'Worker script not found in checks, defaulting to sequential execution');
                throw new Error('Worker script not found');
            }

            debug('planner', `Using worker: ${workerPath}`);

            // Split files into chunks
            const chunkSize = Math.ceil(files.length / WORKER_COUNT);
            const chunks: string[][] = [];
            for (let i = 0; i < files.length; i += chunkSize) {
                chunks.push(files.slice(i, i + chunkSize));
            }

            debug('planner', `Split ${files.length} files into ${chunks.length} chunks`);

            // Run workers
            const workerPromises = chunks.map((chunk, index) => {
                return new Promise<Task[]>((resolve, reject) => {
                    const worker = new Worker(workerPath, {
                        workerData: {
                            files: chunk,
                            rules: rules, // Structured clone handles Map
                            fileTypeCache: fileTypeCache // Structured clone handles Map
                        }
                    });

                    worker.on('message', (message: { tasks: Task[] }) => {
                        resolve(message.tasks);
                    });

                    worker.on('error', reject);

                    worker.on('exit', (code) => {
                        if (code !== 0) {
                            reject(new Error(`Worker ${index} stopped with exit code ${code}`));
                        }
                    });
                });
            });

            const results = await Promise.all(workerPromises);
            const flatTasks = results.flat();

            debug('planner', `Workers completed. Generated ${flatTasks.length} tasks.`);
            return flatTasks;

        } catch (error) {
            debug('planner', `Parallel execution failed, falling back to sequential: ${error}`);
            // Fallthrough to sequential
        }
    }

    const allTasks: Task[] = [];

    // Simple sequential processing - on-demand, no upfront overhead
    for (const file of files) {
        // Detect file type (use cache if available)
        const fileType = fileTypeCache?.get(file) || detectFileType(file);
        if (fileTypeCache && !fileTypeCache.has(file)) {
            fileTypeCache.set(file, fileType);
        }

        // Build tasks for this file
        const fileTasks = buildTasksForFile(file, fileType, rules, context);

        // Convert RuleTask to Task by adding taskId and filePath
        for (const ruleTask of fileTasks) {
            const task: Task = {
                taskId: ruleTask.cacheKey, // Use cacheKey as taskId
                filePath: file,
                ruleName: ruleTask.ruleName,
                severity: ruleTask.severity,
                options: ruleTask.options,
                inputs: ruleTask.inputs,
            };
            allTasks.push(task);
        }
    }

    return allTasks;
};

/**
 * Converts flat tasks array to file-centric plan (backward compatibility).
 *
 * Groups tasks by file and creates FileAnalysisUnit structure
 * that matches the original file-centric plan format.
 *
 * Optimized: Uses a pre-built rules lookup Map instead of O(rules × tasks)
 * nested filter+some per file. With 3,619 files × 69 rules × 38 tasks/file,
 * the old approach did ~9.5M string comparisons. Now it's O(tasks) total.
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
    const plan: Record<string, FileAnalysisUnit> = {};

    // Group tasks by file
    const tasksByFile = new Map<string, Task[]>();
    for (const task of tasks) {
        if (!tasksByFile.has(task.filePath)) {
            tasksByFile.set(task.filePath, []);
        }
        tasksByFile.get(task.filePath)!.push(task);
    }

    // Build FileAnalysisUnit for each file
    for (const [filePath, fileTasks] of tasksByFile) {
        // Reuse file type from cache
        const fileType = fileTypeCache?.get(filePath) || detectFileType(filePath);

        // Collect applicable rules via Set lookup instead of O(rules × tasks) nested scan.
        // Build a Set of rule names from this file's tasks, then pick matching rules from the map.
        const ruleNamesInFile = new Set(fileTasks.map((t) => t.ruleName));
        const applicableRules: any[] = [];
        for (const ruleName of ruleNamesInFile) {
            const rule = rules.get(ruleName);
            if (rule) {
                applicableRules.push(rule);
            }
        }

        // Calculate file-level hash (reuses hashes already in task inputs — no disk I/O)
        const hash =
            fileTasks.length > 0 ? calculateFileHash(fileTasks[0].inputs, applicableRules) : '';

        // Convert Task[] to RuleTask[] for backward compatibility
        const ruleTasks = fileTasks.map((task) => ({
            ruleName: task.ruleName,
            severity: task.severity,
            options: task.options,
            cacheKey: task.taskId,
            inputs: task.inputs,
        }));

        plan[filePath] = {
            file: {
                path: filePath,
                type: fileType,
                hash,
            },
            tasks: ruleTasks,
        };
    }

    return plan;
};
