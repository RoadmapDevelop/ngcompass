import type { RuleContext, RuleFailure } from '@ngcompass/common';

export interface VisitorEntry {
  readonly ruleName: string;

  readonly filter: (rawNode: any) => unknown;

  readonly handle: (
    streamNode: any,
    ctx: RuleContext
  ) => RuleFailure | RuleFailure[] | null;
}

export type VisitorMap = ReadonlyMap<string, ReadonlyArray<VisitorEntry>>;
