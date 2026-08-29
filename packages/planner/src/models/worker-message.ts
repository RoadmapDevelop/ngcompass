import type { ConfigOverride, ResolvedRule } from '@ngcompass/common';
import type { FileType } from './file.js';
import type { Task } from './task.js';

export interface WorkerData {
  files: string[];

  rulesEntries: [string, ResolvedRule][];

  fileTypeCacheEntries?: [string, FileType][];

  overridesData?: ConfigOverride[];
}

export interface WorkerResult {
  tasks: Task[];
}
