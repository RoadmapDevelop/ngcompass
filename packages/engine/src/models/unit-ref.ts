import type { EdgeDirection, LaneStatus } from '@ngcompass/common';

export interface TemplateRef {
  readonly memberName: string;
  readonly direction: EdgeDirection;
  readonly line: number;
  readonly column: number;
  readonly weight: number;
}

export interface DependencyRef {
  readonly typeName: string;
  readonly memberName: string;
  readonly ownerName: string;
  readonly ownerLine: number;
  readonly weight: number;
}

export interface SpecTest {
  readonly title: string;
  readonly line: number;
  readonly column: number;
  readonly start: number;
  readonly end: number;
}

export interface SpecRef {
  readonly testTitle: string;
  readonly testLine: number;
  readonly memberName: string;
  readonly weight: number;
}

export interface SpecAnalysis {
  readonly tests: readonly SpecTest[];
  readonly refs: readonly SpecRef[];
}

export interface StyleSelector {
  readonly name: string;
  readonly line: number;
  readonly column: number;
}

export interface DiscoveredFile {
  readonly filePath: string | null;
  readonly status: LaneStatus;
  readonly content: string | null;
}
