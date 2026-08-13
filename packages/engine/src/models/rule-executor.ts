import type { RuleContext, RuleResult } from '@ngcompass/common';

export type BatchRuleExecutorFn = (
  ruleNames: ReadonlyArray<string>,
  context: RuleContext
) => ReadonlyArray<RuleResult>;

export type RuleCheckerFn = (ruleName: string) => boolean;
