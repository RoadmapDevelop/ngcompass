import type {
  ConfigReport,
  HealthReport,
  InitResult,
  RuleResult,
} from '@ngcompass/common';
import type { CacheInfo } from '@ngcompass/cache';

export type ReporterFormat = 'console' | 'json' | 'html' | 'ui' | 'sarif';

export interface ConsoleReporterOptions {
  readonly compact?: boolean;

  readonly outputPath?: string;

  readonly phaseStream?: NodeJS.WriteStream;

  readonly quiet?: boolean;

  readonly noRecommendation?: boolean;
}

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
  readonly duration: number;
}

export interface AnalysisReporter {
  report(results: ReadonlyArray<RuleResult>): void;

  error(error: Error): void;

  parseErrors(errors: ReadonlyArray<ParseError>): void;
}

export interface ProgressReporter {
  summary(stats: ResultSummary): void;

  step(message: string): void;

  info(message: string): void;

  debug(message: string): void;

  clearLine?(): void;
}

export type Reporter = AnalysisReporter & ProgressReporter;

export interface ConfigReporter {
  reportConfig(report: ConfigReport): void;

  renderInitResult(result: InitResult): void;

  renderHealthReport(report: HealthReport): void;
}

export interface ParseError {
  readonly filePath: string;
  readonly message: string;
}

export interface DiagnosticMessage {
  readonly ruleId: string;
  readonly severity: 1 | 2;
  readonly message: string;
  readonly line: number;
  readonly column: number;
}

export interface FileDiagnosticResult {
  readonly filePath: string;
  readonly messages: readonly DiagnosticMessage[];
  readonly errorCount: number;
  readonly warningCount: number;
}

export interface CacheReporter {
  renderClearResult(type: 'ast' | 'config' | 'results' | 'all'): void;

  renderCacheInfo(info: CacheInfo): void;
}
