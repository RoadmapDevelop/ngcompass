import { parentPort, workerData } from "node:worker_threads";
import { readFile } from "node:fs/promises";
import * as path from "node:path";
import { parseTs, parseHtml } from "../parsers/index.js";
import { getRuleExecutor } from "../rules/registry.js";
import "../rules/register-all.js"; // Register all built-in rules
import { RuleContext, RuleResult, RuleFailure } from "../rules/types.js";
import { Task } from "../planner/index.js";
import type { Program } from "oxc-parser";
import type { HtmlParserResult } from "../parsers/html.js";

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

// const getStyle = (filePath: string): Promise<CssResult | undefined> => {
//     // Placeholder as in orchestrator
//     return Promise.resolve(undefined);
// };

const executeTask = async (task: Task, rootDir: string): Promise<RuleResult> => {
    try {
        const executor = getRuleExecutor(task.ruleName);
        if (!executor) {
            throw new Error(`No executor found for rule: ${task.ruleName}`);
        }

        const fileContent = await readFileCached(task.filePath, rootDir);
        const program = task.inputs.typescript.needsAst ? await getProgram(task.filePath, rootDir) : undefined;

        const templatePath = task.inputs.template?.path ?? task.filePath;
        const template = task.inputs.template?.needsAst ? await getTemplate(templatePath, rootDir) : undefined;

        const context: RuleContext = {
            filePath: task.filePath,
            fileContent,
            program,
            template,
            options: task.options,
        };

        const raw = executor(context);

        // Normalize result
        const failures = (raw && typeof raw === 'object' && 'failures' in raw)
            ? (raw as RuleResult).failures
            : [];

        return {
            ruleName: task.ruleName,
            taskId: task.taskId,
            failures: failures as ReadonlyArray<RuleFailure>,
        };

    } catch (error) {
        throw error;
    }
};

const main = async () => {
    if (!parentPort) return;

    try {
        const { rootDir, tasks } = workerData as ExecutionWorkerData;
        const results: RuleResult[] = [];
        const errors: Array<{ task: Task; error: string }> = [];

        for (const task of tasks) {
            try {
                const result = await executeTask(task, rootDir);
                results.push(result);
            } catch (e) {
                errors.push({
                    task,
                    error: e instanceof Error ? e.message : String(e)
                });
            }
        }

        parentPort.postMessage({ results, errors } satisfies ExecutionWorkerResult);

    } catch (e) {
        // Fatal worker error
        throw e;
    }
};

void main();
