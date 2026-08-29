import type { ParseError } from '../errors.js';
import type { RuleResult } from './rule-result.js';

export interface AnalysisResult {
  readonly results: ReadonlyArray<RuleResult>;

  readonly parseErrors: ReadonlyArray<ParseError>;
  readonly stats: {
    readonly totalFiles: number;
    readonly totalErrors: number;
    readonly totalWarnings: number;
    readonly duration: number;

    readonly cacheHitRate?: number;
  };
}
