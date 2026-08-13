export type Severity = 'warn' | 'error';

export const RuleCategory = {
  Architecture: 'architecture',
  Performance: 'performance',
  SSR: 'ssr',
  Security: 'security',
  Accessibility: 'accessibility',
  Testing: 'testing',
  CodeSmell: 'code-smell',
  Reactivity: 'reactivity',
  BestPractice: 'best-practice',
} as const;

export type RuleCategory = (typeof RuleCategory)[keyof typeof RuleCategory];

export type RuleSeverity = Severity | 'off';

export type RuleConfigShorthand = RuleSeverity;

export interface RuleConfigFull {
  readonly severity: RuleSeverity;
  readonly options?: Readonly<Record<string, unknown>>;
}

export type RuleConfig = RuleConfigShorthand | RuleConfigFull;

export type RulesConfig = Readonly<Record<string, RuleConfig>>;
