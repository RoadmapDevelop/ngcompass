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
