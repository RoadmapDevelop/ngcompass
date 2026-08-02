export type LaneKind = 'ts' | 'template' | 'styles' | 'spec' | 'dependency';

export type LaneStatus =
  | 'parsed'
  | 'inline'
  | 'absent'
  | 'declared-missing'
  | 'unparseable';

export type BoxKind =
  | 'method'
  | 'getter'
  | 'setter'
  | 'constructor'
  | 'field'
  | 'injected'
  | 'function'
  | 'binding'
  | 'selector'
  | 'test'
  | 'member';

export type EdgeDirection = 'data-down' | 'control-up' | 'both' | 'calls';

export type EdgeKind =
  | 'template-event'
  | 'template-binding'
  | 'member-call'
  | 'spec-usage'
  | 'dependency-usage';

export interface UnitBox {
  readonly id: string;
  readonly name: string;
  readonly kind: BoxKind;
  readonly line: number;
  readonly column: number;
}

export interface UnitLane {
  readonly id: string;
  readonly kind: LaneKind;
  readonly status: LaneStatus;
  readonly label: string;
  readonly filePath: string | null;
  readonly boxes: readonly UnitBox[];
}

export interface UnitEdge {
  readonly from: string;
  readonly to: string;
  readonly kind: EdgeKind;
  readonly direction: EdgeDirection;
  readonly weight: number;
}

export interface FileUnitGraph {
  readonly entryFile: string;
  readonly className: string | null;
  readonly lanes: readonly UnitLane[];
  readonly edges: readonly UnitEdge[];
}

export type VisualizeErrorKind = 'EntryUnreadable' | 'EntryUnparseable';

export interface VisualizeError {
  readonly kind: VisualizeErrorKind;
  readonly file: string;
  readonly detail: string;
}
