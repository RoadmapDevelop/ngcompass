/**
 * @fileoverview
 * Worker-thread entry point for syntax-only rule execution.
 *
 * The engine's worker pool spawns one of these per file chunk so syntactic
 * rules can run in parallel across CPU cores. Each worker re-registers the
 * built-in rules (worker threads have their own module registry isolated
 * from the main thread) and wires the rule executor into the engine before
 * processing its chunk.
 */

import { parentPort, workerData } from 'node:worker_threads';
import type { RuleResult } from '@ngcompass/common';
import type { Task } from '@ngcompass/planner';
import {
    configureRuleExecutor,
    createAnalysisContext,
    executeBatchedTasks,
} from '@ngcompass/engine';
import { executeBatchedNewEngineRules, isNewEngineRule } from './engine/adapter.js';
import { registerAllBuiltinRules } from './registry/register-all.js';
import { buildWorkerFileProgress } from './workers/progress.js';

/** Payload received from the parent thread on worker creation. */
export interface ExecutionWorkerData {
    rootDir: string;
    tasks: Task[];
}

/** Payload posted back to the parent thread when the chunk completes. */
export interface ExecutionWorkerResult {
    results: RuleResult[];
    errors: Array<{ task: Task; error: string }>;
}

const main = async (): Promise<void> => {
    registerAllBuiltinRules();
    configureRuleExecutor(executeBatchedNewEngineRules, isNewEngineRule);

    if (!parentPort) return;

    const { rootDir, tasks } = workerData as ExecutionWorkerData;
    const results: RuleResult[] = [];
    const errors: Array<{ task: Task; error: string }> = [];
    const context = createAnalysisContext(rootDir);

    // Group tasks by file so each batch shares one parse + one analysis context.
    const tasksByFile = new Map<string, Task[]>();
    for (const task of tasks) {
        const fileTasks = tasksByFile.get(task.filePath) ?? [];
        fileTasks.push(task);
        tasksByFile.set(task.filePath, fileTasks);
    }

    // Evict per-file caches after each batch so ASTs are released to the GC
    // rather than accumulating for the worker's full chunk.
    for (const [filePath, fileTasks] of tasksByFile) {
        const fileStart = performance.now();
        try {
            const batchResults = await executeBatchedTasks(fileTasks, context);
            results.push(...batchResults);
            parentPort.postMessage(
                buildWorkerFileProgress(filePath, fileTasks.length, batchResults, performance.now() - fileStart, false),
            );
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            for (const task of fileTasks) errors.push({ task, error: message });
            parentPort.postMessage(
                buildWorkerFileProgress(filePath, fileTasks.length, [], performance.now() - fileStart, false),
            );
        } finally {
            context.evict(filePath);
        }
    }

    parentPort.postMessage({ results, errors } satisfies ExecutionWorkerResult);
};

void main();
