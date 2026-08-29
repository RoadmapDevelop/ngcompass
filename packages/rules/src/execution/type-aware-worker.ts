import { type ParserOptions, type RuleResult } from '@ngcompass/common';
import { groupTasksByFile, type Task } from '@ngcompass/planner';
import {
  configureRuleExecutor,
  createTypeAwareAnalysisContext,
  executeBatchedTasks,
  requestGarbageCollectionUnderPressure,
} from '@ngcompass/engine';
import {
  executeBatchedNewEngineRules,
  isNewEngineRule,
} from './adapter.js';
import { registerAllBuiltinRules } from '../registry/register-all.js';
import { buildWorkerFileProgress } from './progress.js';

interface TypeAwareWorkerData {
  readonly rootDir: string;
  readonly tasks: Task[];
  readonly files: string[];
  readonly programRootFiles: string[];
  readonly parserOptions?: ParserOptions;
  readonly buildProjectContext: boolean;
  readonly fileConcurrency?: number;
}

const CHILD_GC_PRESSURE_RATIO = 0.8;

registerAllBuiltinRules();
configureRuleExecutor(executeBatchedNewEngineRules, isNewEngineRule);

process.on('message', (message: TypeAwareWorkerData) => {
  void executeTypeAwareChunk(message);
});

const executeTypeAwareChunk = async (
  data: TypeAwareWorkerData
): Promise<void> => {
  const context = createTypeAwareAnalysisContext(
    data.rootDir,
    data.files,
    data.parserOptions,
    {
      buildProjectContext: data.buildProjectContext,
      programRootFiles: data.programRootFiles,
    }
  );

  try {
    await context.warmup();
    process.send?.({ kind: 'ready' });
    const tasksByFile = groupTasksByFile(data.tasks);

    await runWithConcurrency(
      Array.from(tasksByFile),
      Math.max(1, data.fileConcurrency ?? 1),
      async ([filePath, fileTasks]) => {
        process.send?.({ kind: 'file-start', filePath });
        const fileStart = performance.now();
        try {
          const fileResults = await executeBatchedTasks(fileTasks, context);
          sendFileProgress(
            filePath,
            fileTasks.length,
            fileResults,
            performance.now() - fileStart
          );
          sendFileResult(filePath, fileResults);
        } catch {
          sendFileProgress(
            filePath,
            fileTasks.length,
            [],
            performance.now() - fileStart
          );
          sendFileResult(filePath, []);
        } finally {
          context.evict(filePath);
          requestGarbageCollectionUnderPressure(CHILD_GC_PRESSURE_RATIO);
        }
      }
    );

    process.send?.({ kind: 'complete' });
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

async function runWithConcurrency<T, R>(
  items: ReadonlyArray<T>,
  concurrency: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(concurrency, items.length);

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < items.length) {
        const index = nextIndex++;
        results[index] = await worker(items[index]);
      }
    })
  );
  return results;
}

const sendFileProgress = (
  filePath: string,
  taskCount: number,
  results: ReadonlyArray<RuleResult>,
  duration: number
): void => {
  process.send?.(
    buildWorkerFileProgress(filePath, taskCount, results, duration, true)
  );
};

const sendFileResult = (
  filePath: string,
  results: ReadonlyArray<RuleResult>
): void => {
  process.send?.({ kind: 'file-result', filePath, results });
};
