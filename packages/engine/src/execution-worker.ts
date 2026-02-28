import { parentPort, workerData } from "node:worker_threads";
import { RuleResult } from "@ngcompass/common";
import { Task } from "@ngcompass/planner";
import { createAnalysisContext } from "./analysis-context.js";
import { executeBatchedTasks } from "./runner.js";

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

    // Execute batched tasks per file
    for (const fileTasks of tasksByFile.values()) {
        try {
            const batchResults = await executeBatchedTasks(fileTasks, context);
            results.push(...batchResults);
        } catch (e) {
            for (const task of fileTasks) {
                errors.push({
                    task,
                    error: e instanceof Error ? e.message : String(e)
                });
            }
        }
    }

    parentPort.postMessage({ results, errors } satisfies ExecutionWorkerResult);
};

void main();

