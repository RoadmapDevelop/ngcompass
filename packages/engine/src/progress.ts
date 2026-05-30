import type { RuleResult, WorkerFileProgress } from '@ngcompass/common';

export interface AnalysisFileProgress {
  readonly filePath: string;
  readonly taskCount: number;
  readonly issueCount: number;
  readonly errorCount: number;
  readonly warningCount: number;
  readonly duration: number;
  readonly cached?: boolean;
  readonly typeAware?: boolean;
}

export const buildFileProgress = (
  filePath: string,
  taskCount: number,
  results: ReadonlyArray<RuleResult>,
  duration: number,
  typeAware?: boolean
): AnalysisFileProgress => {
  let errorCount = 0;
  let warningCount = 0;

  for (const result of results) {
    for (const failure of result.failures) {
      if (failure.severity === 'error') errorCount++;
      else if (failure.severity === 'warn') warningCount++;
    }
  }

  return {
    filePath,
    taskCount,
    issueCount: errorCount + warningCount,
    errorCount,
    warningCount,
    duration,
    typeAware,
  };
};

export const isWorkerFileProgress = (
  message: unknown
): message is WorkerFileProgress =>
  !!message &&
  typeof message === 'object' &&
  (message as { kind?: unknown }).kind === 'file-progress';

export const isAnalysisFileProgress = (
  message: unknown
): message is AnalysisFileProgress => {
  if (!message || typeof message !== 'object') return false;
  const value = message as Partial<AnalysisFileProgress> & { kind?: unknown };
  return (
    value.kind === 'file-progress' &&
    typeof value.filePath === 'string' &&
    typeof value.taskCount === 'number' &&
    typeof value.issueCount === 'number' &&
    typeof value.errorCount === 'number' &&
    typeof value.warningCount === 'number' &&
    typeof value.duration === 'number'
  );
};
