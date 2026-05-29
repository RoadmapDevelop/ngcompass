import type { RuleResult, WorkerFileProgress } from '@ngcompass/common';
import { sampleHeapUsage } from '@ngcompass/engine';

export const buildWorkerFileProgress = (
  filePath: string,
  taskCount: number,
  results: ReadonlyArray<RuleResult>,
  duration: number,
  typeAware: boolean
): WorkerFileProgress => {
  let errorCount = 0;
  let warningCount = 0;
  for (const result of results) {
    for (const failure of result.failures) {
      if (failure.severity === 'error') errorCount++;
      else if (failure.severity === 'warn') warningCount++;
    }
  }
  const heap = sampleHeapUsage();
  return {
    kind: 'file-progress',
    filePath,
    taskCount,
    issueCount: errorCount + warningCount,
    errorCount,
    warningCount,
    duration,
    typeAware,
    heapUsedBytes: heap.usedBytes,
    heapLimitBytes: heap.limitBytes,
  };
};
