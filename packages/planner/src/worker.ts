import { parentPort, workerData } from 'node:worker_threads';
import { initHasher } from '@ngcompass/cache';
import type { ConfigOverride, ResolvedRule } from '@ngcompass/common';
import { detectFileType } from './file-type.js';
import { resolveOverridesForFile } from './overrides.js';
import {
  buildTasksForFileTaskCentric,
  type TaskBuilderContext,
} from './task-builder.js';
import type { FileType, Task, TaskInputs } from './types.js';

export interface WorkerData {
  files: string[];

  rulesEntries: [string, ResolvedRule][];

  fileTypeCacheEntries?: [string, FileType][];

  overridesData?: ConfigOverride[];
}

export interface WorkerResult {
  tasks: Task[];
}

const main = async (): Promise<void> => {
  const port = parentPort;
  if (!port) return;

  try {
    const { files, rulesEntries, fileTypeCacheEntries, overridesData } =
      workerData as WorkerData;

    const rules = new Map<string, ResolvedRule>(rulesEntries);
    const fileTypeCache = fileTypeCacheEntries
      ? new Map<string, FileType>(fileTypeCacheEntries)
      : undefined;

    if (rules.size !== rulesEntries.length) {
      throw new Error(
        `Map serialization round-trip failed: expected ${rulesEntries.length} rules, ` +
          `got ${rules.size}. Worker data may have been corrupted by structured-clone.`
      );
    }

    await initHasher();

    const context: TaskBuilderContext = {
      hashCache: new Map<string, string>(),
      resourceCache: new Map<string, TaskInputs>(),
    };

    const tasks = await buildTasksForFiles(
      files,
      rules,
      fileTypeCache,
      context,
      overridesData
    );
    port.postMessage({ tasks } satisfies WorkerResult);
  } catch (error) {
    port.postMessage({ tasks: [] } satisfies WorkerResult);
    throw error;
  }
};

const buildTasksForFiles = async (
  files: ReadonlyArray<string>,
  rules: ReadonlyMap<string, ResolvedRule>,
  fileTypeCache: Map<string, FileType> | undefined,
  context: TaskBuilderContext,
  overrides?: ConfigOverride[]
): Promise<Task[]> => {
  const tasks: Task[] = [];
  for (const file of files) {
    const fileType = fileTypeCache?.get(file) ?? detectFileType(file);
    const fileRules = overrides?.length
      ? resolveOverridesForFile(file, rules, overrides)
      : rules;
    const fileTasks = await buildTasksForFileTaskCentric(
      file,
      fileType,
      fileRules,
      context
    );
    tasks.push(...fileTasks);
  }
  return tasks;
};

void main();
