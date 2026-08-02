export type {
  BoxKind,
  EdgeDirection,
  EdgeKind,
  FileUnitGraph,
  LaneKind,
  LaneStatus,
  UnitBox,
  UnitEdge,
  UnitLane,
  VisualizeError,
  VisualizeErrorKind,
} from '@ngcompass/common';

export const TS_LANE_ID = 'ts';
export const TEMPLATE_LANE_ID = 'template';
export const SPEC_LANE_ID = 'spec';

export function boxId(laneId: string, name: string, line: number): string {
  return `${laneId}#${name}@${line}`;
}

export function dependencyLaneId(typeName: string): string {
  return `dependency:${typeName}`;
}

export function stylesLaneId(index: number): string {
  return `styles:${index}`;
}
