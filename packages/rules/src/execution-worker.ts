import { parentPort, workerData } from 'node:worker_threads';
import type { RuleResult } from '@ngcompass/common';
import type { Task } from '@ngcompass/planner';
import {
  configureRuleExecutor,
  createAnalysisContext,
  executeBatchedTasks,
} from '@ngcompass/engine';
import {
  executeBatchedNewEngineRules,
  isNewEngineRule,
} from './engine/adapter.js';
import { registerAllBuiltinRules } from './registry/register-all.js';
import { buildWorkerFileProgress } from './workers/progress.js';
import type {
  ExecutionWorkerData,
  ExecutionWorkerResult,
} from './models/index.js';

const main = async (): Promise<void> => {
  registerAllBuiltinRules();
  configureRuleExecutor(executeBatchedNewEngineRules, isNewEngineRule);

  if (!parentPort) return;

  const { rootDir, tasks } = workerData as ExecutionWorkerData;
  const results: RuleResult[] = [];
  const errors: Array<{ task: Task; error: string }> = [];
  const context = createAnalysisContext(rootDir);

  const tasksByFile = new Map<string, Task[]>();
  for (const task of tasks) {
    const fileTasks = tasksByFile.get(task.filePath) ?? [];
    fileTasks.push(task);
    tasksByFile.set(task.filePath, fileTasks);
  }

  for (const [filePath, fileTasks] of tasksByFile) {
    const fileStart = performance.now();
    try {
      const batchResults = await executeBatchedTasks(fileTasks, context);
      results.push(...batchResults);
      parentPort.postMessage(
        buildWorkerFileProgress(
          filePath,
          fileTasks.length,
          batchResults,
          performance.now() - fileStart,
          false
        )
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      for (const task of fileTasks) errors.push({ task, error: message });
      parentPort.postMessage(
        buildWorkerFileProgress(
          filePath,
          fileTasks.length,
          [],
          performance.now() - fileStart,
          false
        )
      );
    } finally {
      context.evict(filePath);
    }
  }

  parentPort.postMessage({ results, errors } satisfies ExecutionWorkerResult);
};

void main();
