import type { NormalizedAnalyzerConfig } from './analyzer-config.js';

export interface ConfigIssue {
  readonly code: string;
  readonly message: string;
  readonly path?: ReadonlyArray<string | number>;
  readonly severity: 'error' | 'warning';
  readonly file?: string;
  readonly line?: number;
  readonly column?: number;
  readonly suggestion?: string;
}

export interface HealthReport {
  valid: boolean;
  issues: ConfigIssue[];
  config?: unknown;
}

export type ConfigReport = HealthReport;

export interface InitResult {
  success: boolean;
  filePath: string;
  alreadyExists?: boolean;
}

export interface ConfigValidationResult {
  config?: NormalizedAnalyzerConfig;
  report: HealthReport;
}
