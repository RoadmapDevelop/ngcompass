import { parentPort, workerData } from "node:worker_threads";
import { readFile } from "node:fs/promises";
import * as path from "node:path";
import { parseTs, parseHtml } from "../parsers/index.js";
import "../rules/register-all.js"; // CRITICAL: Register all rules in worker thread
import { RuleResult } from "../rules/types.js";
import { Task } from "../planner/index.js";
import type { Program } from "oxc-parser";
import type { HtmlParserResult } from "../parsers/html.js";
import { executeBatchedTasks as executeSharedBatchedTasks } from "./runner.js";

/**
 * Worker input payload.
 */
export interface ExecutionWorkerData {
    rootDir: string;
    tasks: Task[];
}

/**
 * Worker output payload.
 */
export interface ExecutionWorkerResult {
    results: RuleResult[];
    errors: Array<{ task: Task; error: string }>;
}

// Local caches for the worker lifetime
const fileCache = new Map<string, Promise<string>>();
const programCache = new Map<string, Promise<Program>>();
const templateCache = new Map<string, Promise<HtmlParserResult | undefined>>();
// const styleCache = new Map<string, Promise<CssResult | undefined>>();

const readFileCached = (filePath: string, rootDir: string): Promise<string> => {
    let promise = fileCache.get(filePath);
    if (promise) return promise;

    promise = readFile(path.resolve(rootDir, filePath), "utf-8").catch(() => {
        // Return empty string on error, let parsers handle it or fail later
        return "";
    });
    fileCache.set(filePath, promise!);
    return promise!;
};

const getProgram = (filePath: string, rootDir: string): Promise<Program> => {
    let promise = programCache.get(filePath);
    if (promise) return promise;

    promise = (async () => {
        const content = await readFileCached(filePath, rootDir);
        return parseTs(content, filePath).program;
    })();

    programCache.set(filePath, promise);
    return promise;
};

const getTemplate = (filePath: string, rootDir: string): Promise<HtmlParserResult | undefined> => {
    let promise = templateCache.get(filePath);
    if (promise) return promise;

    promise = (async () => {
        // TODO: Handle inline templates if needed, but for now assuming separate files or simplified lookup
        // For inline templates, we'd need to re-implement the extraction logic or pass it down
        const content = await readFileCached(filePath, rootDir);
        return parseHtml(content);
    })();

    templateCache.set(filePath, promise);
    return promise;
};

/**
 * Executors a batch of tasks using the shared runner.
 */
const executeBatchedTasks = async (
    tasks: ReadonlyArray<Task>,
    rootDir: string
): Promise<RuleResult[]> => {
    // Adapter to match ExecutionContext interface
    const context = {
        rootDir,
        readFile: (p: string) => readFileCached(p, rootDir),
        getProgram: (p: string) => getProgram(p, rootDir),
        getTemplate: (p: string) => getTemplate(p, rootDir),
        getStyle: async () => undefined, // Worker doesn't cache styles yet
    };

    return executeSharedBatchedTasks(tasks, context);
};


const main = async () => {
    if (!parentPort) return;

    try {
        const { rootDir, tasks } = workerData as ExecutionWorkerData;
        const results: RuleResult[] = [];
        const errors: Array<{ task: Task; error: string }> = [];

        // Group tasks by file
        const tasksByFile = new Map<string, Task[]>();
        for (const task of tasks) {
            const fileTasks = tasksByFile.get(task.filePath) ?? [];
            fileTasks.push(task);
            tasksByFile.set(task.filePath, fileTasks); // set again (redundant but safe) with update
        }

        // Execute batched tasks per file
        for (const fileTasks of tasksByFile.values()) {
            try {
                // executeBatchedTasks now handles the batching by options internally
                // We just pass it all tasks for this file
                const batchResults = await executeBatchedTasks(fileTasks, rootDir);
                results.push(...batchResults);
            } catch (e) {
                // If the entire file batch fails (e.g. file read error, parse error)
                // we fail all tasks for this file
                for (const task of fileTasks) {
                    errors.push({
                        task,
                        error: e instanceof Error ? e.message : String(e)
                    });
                }
            }
        }

        parentPort.postMessage({ results, errors } satisfies ExecutionWorkerResult);

    } catch (e) {
        // Fatal worker error
        throw e;
    }
};

void main();
