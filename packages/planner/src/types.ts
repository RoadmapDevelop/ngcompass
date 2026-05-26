import type { CacheContext } from '@ngcompass/cache';
import type { CacheKeyContext } from '@ngcompass/cache';
import {
  Result,
  Ok,
  Err,
  ResolvedRule,
  RuleSeverity,
  AnalysisResult,
} from '@ngcompass/common';
import type { ConfigOverride } from '@ngcompass/common';

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

export type ExecutionPlan = Readonly<Record<string, FileAnalysisUnit>>;

export interface FileAnalysisUnit {
  readonly file: FileInfo;

  readonly tasks: ReadonlyArray<RuleTask>;
}

export interface FileInfo {
  readonly path: string;

  readonly type: FileType;

  readonly hash: string;
}

export type FileType =
  | 'component'
  | 'directive'
  | 'pipe'
  | 'service'
  | 'module'
  | 'guard'
  | 'logic'
  | 'angular-class'
  | 'spec'
  | 'template'
  | 'style'
  | 'config'
  | 'unknown';

export interface RuleTask {
  readonly ruleName: string;

  readonly severity: RuleSeverity;

  readonly options: Readonly<Record<string, unknown>>;

  readonly cacheKey: string;

  readonly inputs: TaskInputs;

  readonly needsTypeChecker?: boolean;

  readonly needsProjectContext?: boolean;
}

export interface TaskInputs {
  typescript: FileInput;

  template?: FileInput;

  styles?: ReadonlyArray<FileInput>;

  spec?: FileInput;
}

export interface FileInput {
  readonly path: string;

  readonly hash: string;

  readonly needsAst: boolean;
}

export type ResourceType = 'typescript' | 'template' | 'styles' | 'spec';

export interface Task {
  readonly taskId: string;

  readonly ruleName: string;

  readonly filePath: string;

  readonly severity: RuleSeverity;

  readonly options: Readonly<Record<string, unknown>>;

  readonly inputs: TaskInputs;

  readonly needsTypeChecker?: boolean;

  readonly needsProjectContext?: boolean;
}

export interface ExecutionIndexes {
  readonly filesNeedingTsAst: ReadonlyArray<string>;

  readonly filesNeedingHtmlAst: ReadonlyArray<string>;

  readonly filesNeedingCssAst: ReadonlyArray<string>;

  readonly filesNeedingTypeChecker: ReadonlyArray<string>;

  readonly tasksByFile: Readonly<Record<string, ReadonlyArray<Task>>>;

  readonly tasksByRule: Readonly<Record<string, ReadonlyArray<string>>>;

  readonly tasksBySeverityLevel: Readonly<
    Record<RuleSeverity, ReadonlyArray<Task>>
  >;

  readonly filesByType: Readonly<Record<FileType, ReadonlyArray<string>>>;

  readonly tasksBySeverity: Readonly<Record<RuleSeverity, number>>;

  readonly stats: ExecutionStats;
}

export interface ExecutionStats {
  readonly totalFiles: number;

  readonly totalTasks: number;

  readonly avgTasksPerFile: number;

  readonly filesWithTemplates: number;

  readonly filesWithStyles: number;

  readonly filesWithSpecs: number;
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

export interface IncrementalPlan {
  readonly skippedTasks: ReadonlyArray<Task>;

  readonly tasks: ReadonlyArray<Task>;

  readonly cachedResults: ReadonlyMap<string, unknown>;

  readonly stats: CacheFilterStats;
}

export interface CacheFilterStats {
  readonly totalTasks: number;

  readonly cachedTasks: number;

  readonly pendingTasks: number;

  readonly cacheHitRate: number;

  readonly timeSavedEstimate: number;
}

export interface IncrementalFilterOptions {
  readonly forceRerun?: boolean;

  readonly loadCachedResults?: boolean;

  readonly maxCacheAge?: number;
}

export interface CachePruneOptions {
  readonly maxAge?: number;

  readonly maxEntries?: number;

  readonly minHits?: number;
}

export type { Result };
export { Ok, Err };
