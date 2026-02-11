/**
 * Analysis Orchestrator
 *
 * Executes tasks against rule executors with memoized parsing and I/O.
 * Produces aggregated RuleResult outputs and summary statistics.
 */

import { readFile } from "node:fs/promises";
import * as path from "node:path";
import pLimit from "p-limit";

import { Task, ExecutionPlanOutput } from "../planner/index.js";
import { CacheContext } from "../cache/index.js";
import { RuleResult, Result, Ok, Err } from "../rules/types.js";
import { parseTs, parseHtml } from "../parsers/index.js";
import { warn, error, debug } from "@ngcompass/common";

import type { Program } from "oxc-parser";
import type { HtmlParserResult } from "../parsers/html.js";
import type { CssResult } from "../parsers/css.js";
import { executeBatchedTasks } from './runner.js';

/**
 * Analysis aggregate output.
 */
export interface AnalysisResult {
    readonly results: ReadonlyArray<RuleResult>;
    readonly stats: {
        readonly totalFiles: number;
        readonly totalErrors: number;
        readonly totalWarnings: number;
        readonly duration: number;
    };
}

/**
 * Memoized, deterministic accessors for file and parser artifacts.
 */
export interface AnalysisContext {
    readonly rootDir: string;
    readonly readFile: (filePath: string) => Promise<string>;
    readonly getProgram: (filePath: string) => Promise<Program>;
    readonly getTemplate: (filePath: string) => Promise<HtmlParserResult | undefined>;
    readonly getStyle: (filePath: string) => Promise<CssResult | undefined>;
}

/**
 * Creates an analysis context with memoized file reads and parsing.
 *
 * @param rootDir - Root directory for resolving file paths
 * @returns AnalysisContext
 */
export const createAnalysisContext = (rootDir: string): AnalysisContext => {
    const fileCache = new Map<string, Promise<string>>();
    const programCache = new Map<string, Promise<Program>>();
    const templateCache = new Map<string, Promise<HtmlParserResult | undefined>>();
    const styleCache = new Map<string, Promise<CssResult | undefined>>();

    const readFileCached = (filePath: string): Promise<string> => {
        const cached = fileCache.get(filePath);
        if (cached) return cached;

        const promise = readFileSafe(rootDir, filePath);
        fileCache.set(filePath, promise);
        return promise;
    };

    const getProgram = (filePath: string): Promise<Program> => {
        const cached = programCache.get(filePath);
        if (cached) return cached;

        const promise = (async () => {
            const content = await readFileCached(filePath);
            return parseTs(content, filePath).program;
        })();

        programCache.set(filePath, promise);
        return promise;
    };

    const getTemplate = (filePath: string): Promise<HtmlParserResult | undefined> => {
        const cached = templateCache.get(filePath);
        if (cached) return cached;

        const promise = (async () => {
            const content = await resolveTemplateContent(filePath, readFileCached, getProgram);
            if (!content) return undefined;
            return parseHtml(content);
        })();

        templateCache.set(filePath, promise);
        return promise;
    };

    const getStyle = (filePath: string): Promise<CssResult | undefined> => {
        const cached = styleCache.get(filePath);
        if (cached) return cached;

        const promise = Promise.resolve(undefined);
        styleCache.set(filePath, promise);
        return promise;
    };

    return { rootDir, readFile: readFileCached, getProgram, getTemplate, getStyle };
};



/**
 * Runs analysis across all tasks using worker threads for parallelism.
 *
 * @param tasks - Tasks to execute
 * @param rootDir - Root directory for resolving paths
 * @returns Aggregated analysis result
 */

/**
 * Options for running the analysis.
 */
export interface AnalysisOptions {
    /** Root directory for resolving file paths */
    readonly rootDir: string;

    /** Optional cache context for retrieving skipped task results */
    readonly cache?: CacheContext;
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
        const startTime = performance.now();
        const { tasks, skippedTasks, cachedResults } = plan;

        // 1. Execute Pending Tasks
        let executedResults: RuleResult[] = [];
        if (tasks.length > 0) {
            // Use workers for heavy loads
            if (tasks.length > 150) {
                debug("engine", `Running analysis on ${tasks.length} tasks using workers...`);
                // Note: runAnalysisParallel still waits for tasks to finish
                const result = await runAnalysisParallel(tasks, options.rootDir, startTime);
                if (result.ok) {
                    executedResults = result.data.results as RuleResult[]; // cast needed as structure matches
                } else {
                    return result;
                }
            } else {
                // Sequential/Local for small loads with batching by file
                debug("engine", `Running analysis on ${tasks.length} tasks locally with batching...`);
                const context = createAnalysisContext(options.rootDir);

                // Group tasks by file for batched execution
                const tasksByFile = new Map<string, Task[]>();
                for (const task of tasks) {
                    const fileTasks = tasksByFile.get(task.filePath) ?? [];
                    fileTasks.push(task);
                    if (fileTasks.length === 1) {
                        tasksByFile.set(task.filePath, fileTasks);
                    }
                }

                debug("engine", `Grouped ${tasks.length} tasks into ${tasksByFile.size} file batches`);

                // Execute batched tasks per file
                const limit = pLimit(4);
                const results = await Promise.all(
                    Array.from(tasksByFile.values()).map(fileTasks =>
                        limit(() => executeBatchedTasksLocal(fileTasks, context))
                    )
                );

                executedResults = results.flat().filter((r): r is RuleResult => r !== null);
            }
        }

        // 2. Retrieve Cached Results for Skipped Tasks
        let skippedResults: RuleResult[] = [];
        if (skippedTasks.length > 0) {
            debug("engine", `Retrieving results for ${skippedTasks.length} skipped tasks...`);

            // 2. Retrieve Cached Results for Skipped Tasks
            const tasksToFetch: Task[] = [];

            // Try to get from pre-loaded cachedResults first
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
            if (tasksToFetch.length > 0 && options.cache) {
                debug("engine", `Fetching ${tasksToFetch.length} results from cache service...`);
                const taskIds = tasksToFetch.map(t => t.taskId);
                const cachedEntries = await options.cache.results.getMany(taskIds);

                for (const task of tasksToFetch) {
                    const entry = cachedEntries.get(task.taskId);
                    if (entry) {
                        // entry IS the result content in the new cache structure?
                        // The ResultCache.getMany returns ReadonlyMap<string, T>
                        // So entry is T (RuleResult)
                        skippedResults.push(entry as unknown as RuleResult);
                    }
                }
            }

            debug("engine", `Retrieved ${skippedResults.length} results from cache`);
        }

        // 3. Aggregate Results
        const successful = [...executedResults, ...skippedResults];

        // DEBUG: Explicit log to see what's happening
        // console.log(`[orchestrator] tasks: ${tasks.length}, skipped: ${skippedTasks.length}, executed: ${executedResults.length}, retrieved: ${skippedResults.length}, total: ${successful.length}`);

        return Ok({
            results: successful,
            stats: calculateStats(successful, startTime),
        });

    } catch (e) {
        return Err(e instanceof Error ? e : new Error(String(e)));
    }
};

/**
 * Simple spinner for showing progress during worker execution
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

const runAnalysisParallel = async (
    tasks: ReadonlyArray<Task>,
    rootDir: string,
    startTime: number
): Promise<Result<AnalysisResult>> => {
    const { Worker } = await import("node:worker_threads");
    const os = await import("node:os");

    // Determine worker count (min 2, max CPU cores)
    const workerCount = Math.max(2, os.cpus().length);
    const workerPath = await resolveWorkerPath();

    if (!workerPath) {
        warn("workers", "Execution worker not found, falling back to local execution.");
        // Fallback logic duplicated for safety
        const context = createAnalysisContext(rootDir);
        const limit = pLimit(4);

        // Group tasks by file (reuse logic)
        const tasksByFile = new Map<string, Task[]>();
        for (const task of tasks) {
            const fileTasks = tasksByFile.get(task.filePath) ?? [];
            fileTasks.push(task);
            if (fileTasks.length === 1) {
                tasksByFile.set(task.filePath, fileTasks);
            }
        }

        const results = await Promise.all(
            Array.from(tasksByFile.values()).map(fileTasks =>
                limit(() => executeBatchedTasksLocal(fileTasks, context))
            )
        );
        const successful = results.flat();
        return Ok({
            results: successful,
            stats: calculateStats(successful, startTime),
        });
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
                reject(err);
            });
            worker.on("exit", (code) => {
                if (code !== 0) {
                    reject(new Error(`Worker stopped with exit code ${code}`));
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
        stats: calculateStats(successful, startTime),
    });
};

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
    // 1. Group tasks by file
    const tasksByFile = new Map<string, Task[]>();
    for (const task of tasks) {
        const fileTasks = tasksByFile.get(task.filePath) ?? [];
        fileTasks.push(task);
        if (fileTasks.length === 1) {
            tasksByFile.set(task.filePath, fileTasks);
        }
    }

    // 2. Sort files by task count (descending) for better packing
    const sortedFiles = Array.from(tasksByFile.values()).sort((a, b) => b.length - a.length);

    // 3. Initialize worker buckets
    const buckets: Task[][] = Array.from({ length: workerCount }, () => []);
    const bucketLoads = new Array(workerCount).fill(0);

    // 4. Distribute files to the least loaded bucket
    for (const fileTasks of sortedFiles) {
        // Find bucket with minimum current load
        let minLoadIndex = 0;
        let minLoad = bucketLoads[0];

        for (let i = 1; i < workerCount; i++) {
            if (bucketLoads[i] < minLoad) {
                minLoad = bucketLoads[i];
                minLoadIndex = i;
            }
        }

        // Add tasks to that bucket
        buckets[minLoadIndex].push(...fileTasks);
        bucketLoads[minLoadIndex] += fileTasks.length;
    }

    return buckets;
};

/**
 * Reads a file relative to rootDir with error handling.
 *
 * @param rootDir - Root directory
 * @param filePath - File path (relative or absolute)
 * @returns File contents or empty string on failure
 */
const readFileSafe = async (rootDir: string, filePath: string): Promise<string> => {
    try {
        return await readFile(path.resolve(rootDir, filePath), "utf-8");
    } catch (e) {
        warn("workers", `Failed to read file: ${filePath}. ${e instanceof Error ? e.message : String(e)}`);
        return "";
    }
};

/**
 * Resolves template content from either an HTML file or inline template in TS.
 *
 * @param filePath - Template path or TS path
 * @param readFileCached - Memoized file read
 * @param getProgram - Memoized program parse
 * @returns Template content or empty string
 */
const resolveTemplateContent = async (
    filePath: string,
    readFileCached: (p: string) => Promise<string>,
    getProgram: (p: string) => Promise<Program>
): Promise<string> => {
    const ext = path.extname(filePath);

    if (ext === ".html") {
        return readFileCached(filePath);
    }

    if (ext === ".ts") {
        const program = await getProgram(filePath);
        return extractInlineTemplate(program);
    }

    return "";
};

/**
 * Extracts an inline template string from an Oxc program.
 *
 * @param program - Oxc program
 * @returns Template string or empty
 */
const extractInlineTemplate = (program: any): string => {
    let template = "";

    const visit = (node: any): void => {
        if (!node || template) return;

        if (node.type === "ClassDeclaration" && Array.isArray(node.decorators)) {
            for (const decorator of node.decorators) {
                const call = decorator?.expression;
                if (!call || call.type !== "CallExpression") continue;
                if (call.callee?.type !== "Identifier" || call.callee.name !== "Component") continue;

                const objectArg = call.arguments?.[0];
                if (!objectArg || objectArg.type !== "ObjectExpression") continue;

                const value = findObjectPropertyValue(objectArg.properties, "template");
                const extracted = value ? extractTemplateLiteralValue(value) : "";
                if (extracted) template = extracted;
            }
        }

        for (const key of Object.keys(node)) {
            const val = node[key];
            if (Array.isArray(val)) val.forEach(visit);
            else if (val && typeof val === "object" && "type" in val) visit(val);
        }
    };

    visit(program);
    return template;
};

/**
 * Finds an ObjectExpression property value by key name.
 *
 * @param properties - ObjectExpression properties
 * @param keyName - Key name
 * @returns Value node or null
 */
const findObjectPropertyValue = (properties: any[] | undefined, keyName: string): any | null => {
    if (!Array.isArray(properties)) return null;

    for (const prop of properties) {
        const key = prop?.key;
        const value = prop?.value;
        if (!key || !value) continue;

        const name = key?.name ?? key?.value;
        if (name === keyName) return value;
    }

    return null;
};

/**
 * Extracts a string value from a StringLiteral or TemplateLiteral node.
 *
 * @param node - Expression node
 * @returns Extracted string or empty
 */
const extractTemplateLiteralValue = (node: any): string => {
    if (!node) return "";

    if (node.type === "StringLiteral") return node.value ?? "";

    if (node.type === "TemplateLiteral") {
        const quasis = node.quasis ?? [];
        return Array.isArray(quasis) ? quasis.map((q: any) => q.value?.raw ?? "").join("") : "";
    }

    return "";
};





/**
 * Calculates aggregate statistics for analysis.
 *
 * @param results - Rule results
 * @param startTime - Start timestamp
 * @returns Stats object
 */
const calculateStats = (results: ReadonlyArray<RuleResult>, startTime: number): AnalysisResult["stats"] => {
    const duration = performance.now() - startTime;
    const failures = results.flatMap((r) => r.failures);

    const uniqueFiles = new Set<string>(failures.map((f: any) => f.filePath));

    const totalErrors = failures.filter((f: any) => isErrorSeverity(f?.severity)).length;
    const totalWarnings = failures.filter((f: any) => isWarningSeverity(f?.severity)).length;

    return {
        totalFiles: uniqueFiles.size,
        totalErrors,
        totalWarnings,
        duration,
    };
};

/**
 * Determines whether a severity represents an error.
 *
 * @param severity - Severity value
 * @returns true if severity counts as error
 */
const isErrorSeverity = (severity: unknown): boolean => {
    return severity === "critical" || severity === "high" || severity === "error";
};

/**
 * Determines whether a severity represents an warning.
 *
 * @param severity - Severity value
 * @returns true if severity counts as warning
 */
const isWarningSeverity = (severity: unknown): boolean => {
    return severity === "moderate" || severity === "low" || severity === "warn";
};

/**
 * Executes a batch of tasks for a single file, using the shared runner.
 *
 * @param tasks - Tasks to execute (all for same file)
 * @param context - Analysis context
 * @returns Array of RuleResults
 */
const executeBatchedTasksLocal = async (tasks: Task[], context: AnalysisContext): Promise<RuleResult[]> => {
    return executeBatchedTasks(tasks, context);
};

