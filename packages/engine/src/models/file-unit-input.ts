import type { Program } from 'oxc-parser';
import type { TemplateAnalysis } from '@ngcompass/ast';
import type { LaneStatus, Locator } from '@ngcompass/common';

export interface TemplateInput {
  readonly status: LaneStatus;
  readonly filePath: string | null;
  readonly label: string;
  readonly analysis: TemplateAnalysis | null;
  readonly locator: Locator | null;
}

export interface StyleInput {
  readonly status: LaneStatus;
  readonly filePath: string | null;
  readonly label: string;
  readonly content: string | null;
}

export interface SpecInput {
  readonly status: LaneStatus;
  readonly filePath: string | null;
  readonly label: string;
  readonly program: Program | null;
  readonly locator: Locator | null;
}

export interface FileUnitInput {
  readonly entryFile: string;
  readonly entryLabel: string;
  readonly program: Program;
  readonly locator: Locator;
  readonly template: TemplateInput | null;
  readonly styles: readonly StyleInput[];
  readonly spec: SpecInput | null;
}
