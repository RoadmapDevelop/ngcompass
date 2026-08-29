import type { RuleContext, RuleFailure } from '@ngcompass/common';
import type { StreamNode } from './rule-handler.js';

export interface TraversedNode {
  readonly type: string;
}

export type StreamFilter = (rawNode: TraversedNode) => StreamNode | null;

export interface VisitorEntry {
  readonly ruleName: string;

  readonly filter: StreamFilter;

  readonly handle: (
    streamNode: StreamNode,
    ctx: RuleContext
  ) => RuleFailure | RuleFailure[] | null;
}

export type VisitorMap = ReadonlyMap<string, ReadonlyArray<VisitorEntry>>;
