import type { AnalysisResult, ConfigOverride, ResolvedRule } from '@ngcompass/common';
import type { CacheContext, CacheKeyContext } from '@ngcompass/cache';
import type { FileInfo } from './file.js';
import type { ExecutionIndexes } from './execution-index.js';
import type { IncrementalFilterOptions } from './incremental.js';
import type { RuleTask, Task } from './task.js';

export interface FileAnalysisUnit {
  readonly file: FileInfo;

  readonly tasks: ReadonlyArray<RuleTask>;
}

export type ExecutionPlan = Readonly<Record<string, FileAnalysisUnit>>;

export interface ExecutionPlanOutput {
  readonly tasks: ReadonlyArray<Task>;

  readonly plan: ExecutionPlan;

  readonly indexes: ExecutionIndexes;

  readonly skippedTasks: ReadonlyArray<Task>;

  readonly cachedResults?: ReadonlyMap<string, unknown>;

  readonly globalHash?: string;

  readonly precomputedAnalysis?: AnalysisResult;

  readonly changedFiles?: ReadonlyArray<string>;

  readonly cachedFiles?: ReadonlyArray<string>;
}

export interface ExecutionPlanOptions {
  readonly files: ReadonlyArray<string>;

  readonly rules: ReadonlyMap<string, ResolvedRule>;

  readonly rootDir: string;

  readonly cache?: CacheContext;

  readonly debug?: boolean;

  readonly incremental?: IncrementalFilterOptions;

  readonly cacheKeyCtx?: CacheKeyContext;

  readonly parallelThreshold?: number;

  readonly workerCount?: number;

  readonly overrides?: ReadonlyArray<ConfigOverride>;
}
