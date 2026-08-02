import type { Program } from 'oxc-parser';
import type { TemplateAnalysis } from '@ngcompass/ast';
import { Locator } from '@ngcompass/common';
import { computeFileCallGraph } from '../callgraph/call-graph-analyzer.js';
import { type AstNodeLike, isNode } from '../shared/ast-functions.js';
import { collectDependencyRefs } from './dependency-refs.js';
import { analyzeSpec } from './spec-refs.js';
import { collectStyleSelectors } from './style-selectors.js';
import { collectTemplateRefs } from './template-refs.js';
import {
  type FileUnitGraph,
  type LaneStatus,
  type UnitBox,
  type UnitEdge,
  type UnitLane,
  SPEC_LANE_ID,
  TEMPLATE_LANE_ID,
  TS_LANE_ID,
  boxId,
  dependencyLaneId,
  stylesLaneId,
} from './unit-graph.js';
import { type MemberSpan, ownerOfLine, readEntryClass } from './ts-members.js';

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

function memberBoxes(members: readonly MemberSpan[]): UnitBox[] {
  const boxes: UnitBox[] = [];
  for (const member of members) {
    boxes.push({
      id: boxId(TS_LANE_ID, member.name, member.line),
      name: member.name,
      kind: member.kind,
      line: member.line,
      column: member.column,
    });
  }
  return boxes;
}

function indexByName(
  members: readonly MemberSpan[]
): ReadonlyMap<string, MemberSpan> {
  const index = new Map<string, MemberSpan>();
  for (const member of members) {
    if (!index.has(member.name)) index.set(member.name, member);
  }
  return index;
}

function addMemberCallEdges(
  program: Program,
  locator: Locator,
  members: readonly MemberSpan[],
  edges: UnitEdge[]
): void {
  const graph = computeFileCallGraph(program, locator);

  const ownerById = new Map<string, MemberSpan>();
  for (const node of graph.nodes) {
    const owner = ownerOfLine(members, node.line);
    if (owner) ownerById.set(node.id, owner);
  }

  const tally = new Map<string, UnitEdge>();
  for (const edge of graph.edges) {
    if (edge.from === null) continue;
    const from = ownerById.get(edge.from);
    const to = ownerById.get(edge.to);
    if (!from || !to || from === to) continue;

    const fromId = boxId(TS_LANE_ID, from.name, from.line);
    const toId = boxId(TS_LANE_ID, to.name, to.line);
    const key = `${fromId}->${toId}`;
    const existing = tally.get(key);
    tally.set(key, {
      from: fromId,
      to: toId,
      kind: 'member-call',
      direction: 'calls',
      weight: (existing?.weight ?? 0) + 1,
    });
  }

  for (const edge of tally.values()) edges.push(edge);
}

function buildTemplateLane(
  template: TemplateInput,
  byName: ReadonlyMap<string, MemberSpan>,
  edges: UnitEdge[]
): UnitLane {
  const base = {
    id: TEMPLATE_LANE_ID,
    kind: 'template',
    status: template.status,
    label: template.label,
    filePath: template.filePath,
  } as const;

  if (!template.analysis || !template.locator) {
    return { ...base, boxes: [] };
  }

  const refs = collectTemplateRefs(
    template.analysis,
    new Set(byName.keys()),
    template.locator
  );

  const boxes = new Map<string, UnitBox>();
  for (const ref of refs) {
    const member = byName.get(ref.memberName);
    if (!member) continue;

    const existing = boxes.get(ref.memberName);
    const line = existing ? Math.min(existing.line, ref.line) : ref.line;
    const id = boxId(TEMPLATE_LANE_ID, ref.memberName, 0);
    boxes.set(ref.memberName, {
      id,
      name: ref.memberName,
      kind: 'binding',
      line,
      column: ref.column,
    });

    const memberBoxIdentifier = boxId(TS_LANE_ID, member.name, member.line);
    const isEvent = ref.direction === 'control-up';
    edges.push({
      from: isEvent ? id : memberBoxIdentifier,
      to: isEvent ? memberBoxIdentifier : id,
      kind: isEvent ? 'template-event' : 'template-binding',
      direction: ref.direction,
      weight: ref.weight,
    });
  }

  return { ...base, boxes: Array.from(boxes.values()) };
}

function buildStyleLanes(styles: readonly StyleInput[]): UnitLane[] {
  const lanes: UnitLane[] = [];

  for (let i = 0; i < styles.length; i++) {
    const style = styles[i];
    const laneId = stylesLaneId(i);
    const boxes: UnitBox[] = [];

    if (style.content !== null) {
      const locator = new Locator(style.content);
      for (const selector of collectStyleSelectors(style.content, locator)) {
        boxes.push({
          id: boxId(laneId, selector.name, selector.line),
          name: selector.name,
          kind: 'selector',
          line: selector.line,
          column: selector.column,
        });
      }
    }

    lanes.push({
      id: laneId,
      kind: 'styles',
      status: style.status,
      label: style.label,
      filePath: style.filePath,
      boxes,
    });
  }

  return lanes;
}

function buildSpecLane(
  spec: SpecInput,
  className: string | null,
  byName: ReadonlyMap<string, MemberSpan>,
  edges: UnitEdge[]
): UnitLane {
  const base = {
    id: SPEC_LANE_ID,
    kind: 'spec',
    status: spec.status,
    label: spec.label,
    filePath: spec.filePath,
  } as const;

  if (!spec.program || !spec.locator || !isNode(spec.program)) {
    return { ...base, boxes: [] };
  }

  const analysis = analyzeSpec(
    spec.program,
    spec.locator,
    className,
    new Set(byName.keys())
  );

  const boxes: UnitBox[] = [];
  for (const test of analysis.tests) {
    boxes.push({
      id: boxId(SPEC_LANE_ID, test.title, test.line),
      name: test.title,
      kind: 'test',
      line: test.line,
      column: test.column,
    });
  }

  for (const ref of analysis.refs) {
    const member = byName.get(ref.memberName);
    if (!member) continue;
    edges.push({
      from: boxId(SPEC_LANE_ID, ref.testTitle, ref.testLine),
      to: boxId(TS_LANE_ID, member.name, member.line),
      kind: 'spec-usage',
      direction: 'calls',
      weight: ref.weight,
    });
  }

  return { ...base, boxes };
}

function buildDependencyLanes(
  program: AstNodeLike,
  members: readonly MemberSpan[],
  injected: ReadonlyMap<string, string>,
  edges: UnitEdge[]
): UnitLane[] {
  const refs = collectDependencyRefs(program, members, injected);
  const byType = new Map<string, Map<string, UnitBox>>();

  for (const typeName of injected.values()) {
    if (!byType.has(typeName)) byType.set(typeName, new Map());
  }

  for (const ref of refs) {
    const laneId = dependencyLaneId(ref.typeName);
    const boxes = byType.get(ref.typeName);
    if (!boxes) continue;

    const id = boxId(laneId, ref.memberName, 0);
    boxes.set(ref.memberName, {
      id,
      name: ref.memberName,
      kind: 'member',
      line: 0,
      column: 0,
    });

    edges.push({
      from: boxId(TS_LANE_ID, ref.ownerName, ref.ownerLine),
      to: id,
      kind: 'dependency-usage',
      direction: 'calls',
      weight: ref.weight,
    });
  }

  const lanes: UnitLane[] = [];
  for (const [typeName, boxes] of byType) {
    lanes.push({
      id: dependencyLaneId(typeName),
      kind: 'dependency',
      status: 'parsed',
      label: typeName,
      filePath: null,
      boxes: Array.from(boxes.values()),
    });
  }
  return lanes;
}

export function analyzeFileUnitGraph(input: FileUnitInput): FileUnitGraph {
  const program = input.program;
  if (!isNode(program)) {
    return { entryFile: input.entryFile, className: null, lanes: [], edges: [] };
  }

  const { className, members, injected } = readEntryClass(program, input.locator);
  const byName = indexByName(members);
  const edges: UnitEdge[] = [];

  const lanes: UnitLane[] = [
    {
      id: TS_LANE_ID,
      kind: 'ts',
      status: 'parsed',
      label: input.entryLabel,
      filePath: input.entryFile,
      boxes: memberBoxes(members),
    },
  ];

  addMemberCallEdges(program, input.locator, members, edges);

  if (input.template) {
    lanes.push(buildTemplateLane(input.template, byName, edges));
  }
  lanes.push(...buildStyleLanes(input.styles));
  if (input.spec) {
    lanes.push(buildSpecLane(input.spec, className, byName, edges));
  }

  const injectedByProperty = new Map<string, string>();
  for (const dependency of injected) {
    injectedByProperty.set(dependency.propertyName, dependency.typeName);
  }
  lanes.push(
    ...buildDependencyLanes(program, members, injectedByProperty, edges)
  );

  return { entryFile: input.entryFile, className, lanes, edges };
}
