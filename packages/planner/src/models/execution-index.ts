import type { RuleSeverity } from '@ngcompass/common';
import type { FileType } from './file.js';
import type { Task } from './task.js';

export interface ExecutionStats {
  readonly totalFiles: number;

  readonly totalTasks: number;

  readonly avgTasksPerFile: number;

  readonly filesWithTemplates: number;

  readonly filesWithStyles: number;

  readonly filesWithSpecs: number;
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
