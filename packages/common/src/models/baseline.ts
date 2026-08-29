export type BaselineStaleMode = 'ignore' | 'warn' | 'error';

export type BaselineRuleCounts = Readonly<Record<string, number>>;

export interface BaselineFile {
  readonly version: number;
  readonly entries: Readonly<Record<string, BaselineRuleCounts>>;
}

export interface BaselineConfig {
  readonly enabled: boolean;
  readonly path: string;
  readonly onStale: BaselineStaleMode;
}

export interface BaselineRuleFile {
  readonly filePath: string;
  readonly count: number;
}

export interface BaselineRuleSummary {
  readonly ruleName: string;
  readonly total: number;
  readonly share: number;
  readonly fileCount: number;
  readonly files: ReadonlyArray<BaselineRuleFile>;
  readonly omittedFiles: number;
}

export interface BaselineReport {
  readonly path: string;
  readonly totalFiles: number;
  readonly totalViolations: number;
  readonly rules: ReadonlyArray<BaselineRuleSummary>;
}
