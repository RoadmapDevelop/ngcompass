import { RuleResult, WorkerFileProgress, type ParserOptions } from "@ngcompass/common";
import { Task, groupTasksByFile } from "@ngcompass/planner";
import { createTypeAwareAnalysisContext, executeBatchedTasks, configureRuleExecutor } from "@ngcompass/engine";
import { registerAllBuiltinRules } from "./registry/register-all.js";
import { executeBatchedNewEngineRules, isNewEngineRule } from "./engine/adapter.js";

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

        const batchResults = await runWithConcurrency(Array.from(tasksByFile), Math.max(1, data.fileConcurrency ?? 1), async ([filePath, fileTasks]) => {
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
        });
        results.push(...batchResults.flat());

        process.send?.({ kind: 'complete', results });
    } catch (error) {
        process.send?.({ kind: 'error', error: error instanceof Error ? error.message : String(error) });
    } finally {
        context.dispose();
        process.disconnect?.();
    }
};

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
    process.send?.(buildFileProgress(filePath, taskCount, results, duration));
};

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
