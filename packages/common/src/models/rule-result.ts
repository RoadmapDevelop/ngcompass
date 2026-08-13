import type { RuleSeverity } from './rule-config.js';

export interface RuleFailure {
  readonly filePath: string;
  readonly message: string;
  readonly line: number;
  readonly column: number;
  readonly severity: RuleSeverity;
  readonly ruleName: string;

  readonly fix?: string;

  readonly codeExample?: string;
}

export interface RuleResult {
  readonly ruleName: string;
  readonly failures: ReadonlyArray<RuleFailure>;
  readonly taskId?: string;
}
