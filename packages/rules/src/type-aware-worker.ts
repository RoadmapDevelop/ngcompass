/**
 * @fileoverview
 * Child-process entry point for type-aware rule execution.
 *
 * The orchestrator forks one of these per type-aware chunk so the
 * TypeScript `Program` (which can consume several GB on large monorepos)
 * lives in its own OS-isolated heap and is reclaimed when the child exits.
 *
 * Communication runs over the standard `process.send` / `process.on('message')`
 * IPC channel; the parent sends a single `TypeAwareWorkerData` payload, and
 * this worker streams `WorkerFileProgress` events back, finishing with
 * either a `'complete'` or `'error'` message.
 */

import { type ParserOptions, type RuleResult } from '@ngcompass/common';
import { groupTasksByFile, type Task } from '@ngcompass/planner';
import {
    configureRuleExecutor,
    createTypeAwareAnalysisContext,
    executeBatchedTasks,
} from '@ngcompass/engine';
import { executeBatchedNewEngineRules, isNewEngineRule } from './engine/adapter.js';
import { registerAllBuiltinRules } from './registry/register-all.js';
import { buildWorkerFileProgress } from './workers/progress.js';

interface TypeAwareWorkerData {
    readonly rootDir: string;
    readonly tasks: Task[];
    readonly files: string[];
    readonly programRootFiles: string[];
    readonly parserOptions?: ParserOptions;
    readonly buildProjectContext: boolean;
    readonly fileConcurrency?: number;
}

registerAllBuiltinRules();
configureRuleExecutor(executeBatchedNewEngineRules, isNewEngineRule);

process.on('message', (message: TypeAwareWorkerData) => {
    void executeTypeAwareChunk(message);
});

const executeTypeAwareChunk = async (data: TypeAwareWorkerData): Promise<void> => {
    const results: RuleResult[] = [];
    const context = createTypeAwareAnalysisContext(data.rootDir, data.files, data.parserOptions, {
        buildProjectContext: data.buildProjectContext,
        programRootFiles: data.programRootFiles,
    });

    try {
        await context.warmup();
        const tasksByFile = groupTasksByFile(data.tasks);

        const batchResults = await runWithConcurrency(
            Array.from(tasksByFile),
            Math.max(1, data.fileConcurrency ?? 1),
            async ([filePath, fileTasks]) => {
                const fileStart = performance.now();
                try {
                    const fileResults = await executeBatchedTasks(fileTasks, context);
                    sendFileProgress(filePath, fileTasks.length, fileResults, performance.now() - fileStart);
                    return fileResults;
                } catch {
                    sendFileProgress(filePath, fileTasks.length, [], performance.now() - fileStart);
                    return [];
                } finally {
                    context.evict(filePath);
                }
            },
        );
        results.push(...batchResults.flat());

        process.send?.({ kind: 'complete', results });
    } catch (error) {
        process.send?.({
            kind: 'error',
            error: error instanceof Error ? error.message : String(error),
        });
    } finally {
        context.dispose();
        process.disconnect?.();
    }
};

/**
 * Worker-pool implementation that respects a max-in-flight count. Order of
 * results matches the input order so callers can `.flat()` deterministically.
 */
async function runWithConcurrency<T, R>(
    items: ReadonlyArray<T>,
    concurrency: number,
    worker: (item: T) => Promise<R>,
): Promise<R[]> {
    const results: R[] = new Array(items.length);
    let nextIndex = 0;
    const workerCount = Math.min(concurrency, items.length);

    await Promise.all(Array.from({ length: workerCount }, async () => {
        while (nextIndex < items.length) {
            const index = nextIndex++;
            results[index] = await worker(items[index]);
        }
    }));
    return results;
}

const sendFileProgress = (
    filePath: string,
    taskCount: number,
    results: ReadonlyArray<RuleResult>,
    duration: number,
): void => {
    process.send?.(buildWorkerFileProgress(filePath, taskCount, results, duration, true));
};
