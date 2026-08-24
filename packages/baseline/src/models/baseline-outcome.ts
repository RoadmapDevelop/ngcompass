import type { BaselineFile, RuleResult } from '@ngcompass/common';

export interface StaleEntry {
  readonly filePath: string;
  readonly ruleName: string;
  readonly recorded: number;
  readonly found: number;
}

export interface RenameMatch {
  readonly from: string;
  readonly to: string;
}

export interface ReconcileOutcome {
  readonly entries: Readonly<Record<string, Readonly<Record<string, number>>>>;
  readonly renamed: ReadonlyArray<RenameMatch>;
  readonly unmatchedFiles: ReadonlyArray<string>;
  readonly ambiguousFiles: ReadonlyArray<string>;
}

export interface BaselineOutcome {
  readonly results: ReadonlyArray<RuleResult>;
  readonly suppressedCount: number;
  readonly staleEntries: ReadonlyArray<StaleEntry>;
  readonly renamed: ReadonlyArray<RenameMatch>;
  readonly unmatchedFiles: ReadonlyArray<string>;
  readonly ambiguousFiles: ReadonlyArray<string>;
}

export interface PruneOutcome {
  readonly baseline: BaselineFile;
  readonly renamed: ReadonlyArray<RenameMatch>;
  readonly removedFiles: ReadonlyArray<string>;
}
