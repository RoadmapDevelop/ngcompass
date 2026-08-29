export interface ResultSummary {
  readonly scannedFiles: number;

  readonly discoveredFiles?: number;

  readonly totalFiles: number;
  readonly totalTasks: number;
  readonly cachedTasks?: number;
  readonly totalErrors: number;
  readonly totalWarnings: number;
  readonly failOnSeverity?: 'warn' | 'error';
  readonly maxWarnings?: number;
  readonly suppressedByBaseline?: number;
  readonly baselineStaleEntries?: number;
  readonly skippedFiles?: number;
  readonly skippedFilePaths?: ReadonlyArray<string>;
  readonly duration: number;
}

export type AnalysisStatus = 'passed' | 'passed-with-warnings' | 'failed';

export interface AnalysisStatusInfo {
  readonly status: AnalysisStatus;
  readonly label: 'PASS' | 'WARN' | 'FAILED';
}
