import { parentPort, workerData } from "node:worker_threads";
import { RuleResult, WorkerFileProgress } from "@ngcompass/common";
import { Task } from "@ngcompass/planner";
import { createAnalysisContext, executeBatchedTasks, configureRuleExecutor } from "@ngcompass/engine";
import { registerAllBuiltinRules } from "./registry/register-all.js";
import { executeBatchedNewEngineRules, isNewEngineRule } from "./engine/adapter.js";

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

const main = async () => {

    // Re-register all built-in rules — each worker thread has its own module
    // registry isolated from the main thread, so registration must happen here.
    registerAllBuiltinRules();

    // Wire the rule executor into the engine's DI boundary so that
    // executeBatchedTasks() can call back into the rules registry.
    configureRuleExecutor(executeBatchedNewEngineRules, isNewEngineRule);

    if (!parentPort) return;

    const { rootDir, tasks } = workerData as ExecutionWorkerData;
    const results: RuleResult[] = [];
    const errors: Array<{ task: Task; error: string }> = [];

    // Use the shared analysis context (same memoized caches as orchestrator)
    const context = createAnalysisContext(rootDir);

    // Group tasks by file
    const tasksByFile = new Map<string, Task[]>();
    for (const task of tasks) {
        const fileTasks = tasksByFile.get(task.filePath) ?? [];
        fileTasks.push(task);
        tasksByFile.set(task.filePath, fileTasks);
    }

    // Execute batched tasks per file — evict after each file so ASTs are
    // released to the GC rather than accumulating for the worker's full chunk.
    for (const [filePath, fileTasks] of tasksByFile) {
        const fileStart = performance.now();
        try {
            const batchResults = await executeBatchedTasks(fileTasks, context);
            results.push(...batchResults);
            parentPort.postMessage(buildFileProgress(filePath, fileTasks.length, batchResults, performance.now() - fileStart));
        } catch (e) {
            for (const task of fileTasks) {
                errors.push({
                    task,
                    error: e instanceof Error ? e.message : String(e)
                });
            }
            parentPort.postMessage(buildFileProgress(filePath, fileTasks.length, [], performance.now() - fileStart));
        } finally {
            context.evict(filePath);
        }
    }

    parentPort.postMessage({ results, errors } satisfies ExecutionWorkerResult);
};

void main();

const buildFileProgress = (
    filePath: string,
    taskCount: number,
    results: ReadonlyArray<RuleResult>,
    duration: number,
): WorkerFileProgress => {
    let errorCount = 0;
    let warningCount = 0;

    for (const result of results) {
        for (const failure of result.failures) {
            if (failure.severity === 'error') errorCount++;
            else if (failure.severity === 'warn') warningCount++;
        }
    }

    return {
        kind: 'file-progress',
        filePath,
        taskCount,
        issueCount: errorCount + warningCount,
        errorCount,
        warningCount,
        duration,
    };
};
