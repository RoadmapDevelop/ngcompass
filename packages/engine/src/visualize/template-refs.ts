import { type TemplateAnalysis, parseTs } from '@ngcompass/ast';
import { Locator, debug } from '@ngcompass/common';
import {
  MEMBER_TYPES,
  isNode,
  walkWithParent,
} from '../execution/ast-functions.js';
import type { EdgeDirection } from './unit-graph.js';
import type {
  AstNodeLike,
  TemplateRef,
} from '../models/index.js';
interface DirectedRange {
  readonly start: number;
  readonly end: number;
  readonly direction: EdgeDirection;
}

interface RefAccumulator {
  readonly memberName: string;
  readonly direction: EdgeDirection;
  readonly line: number;
  readonly column: number;
  weight: number;
}

function attributeDirection(name: string): EdgeDirection | undefined {
  if (name.startsWith('[(') && name.endsWith(')]')) return 'both';
  if (name.startsWith('bindon-')) return 'both';
  if (name.startsWith('(') && name.endsWith(')')) return 'control-up';
  if (name.startsWith('on-')) return 'control-up';
  return undefined;
}

function collectDirectedRanges(analysis: TemplateAnalysis): DirectedRange[] {
  const ranges: DirectedRange[] = [];
  for (const attribute of analysis.attributes) {
    const direction = attributeDirection(attribute.name);
    if (!direction) continue;
    ranges.push({
      start: attribute.sourceSpan.start,
      end: attribute.sourceSpan.end,
      direction,
    });
  }
  return ranges;
}

function directionAt(
  ranges: readonly DirectedRange[],
  start: number
): EdgeDirection {
  for (const range of ranges) {
    if (range.start <= start && start < range.end) return range.direction;
  }
  return 'data-down';
}

function isMemberProperty(node: AstNodeLike, parent: AstNodeLike): boolean {
  return (
    MEMBER_TYPES.has(parent.type) &&
    parent.property === node &&
    parent.computed !== true
  );
}

function countsAsReference(
  node: AstNodeLike,
  parent: AstNodeLike | undefined
): boolean {
  if (!parent) return true;
  if (!isMemberProperty(node, parent)) return true;
  return isNode(parent.object) && parent.object.type === 'ThisExpression';
}

function tallyExpression(
  expression: AstNodeLike,
  memberNames: ReadonlySet<string>,
  direction: EdgeDirection,
  fallback: { readonly line: number; readonly column: number },
  tally: Map<string, RefAccumulator>
): void {
  walkWithParent(expression, undefined, (node, parent) => {
    if (node.type !== 'Identifier') return;
    if (typeof node.name !== 'string') return;
    if (!memberNames.has(node.name)) return;
    if (!countsAsReference(node, parent)) return;

    const key = `${direction}|${node.name}`;
    const existing = tally.get(key);
    if (existing) {
      existing.weight++;
      return;
    }
    tally.set(key, {
      memberName: node.name,
      direction,
      line: fallback.line,
      column: fallback.column,
      weight: 1,
    });
  });
}

function tallyEventAttributes(
  analysis: TemplateAnalysis,
  memberNames: ReadonlySet<string>,
  locator: Locator,
  tally: Map<string, RefAccumulator>
): void {
  for (const attribute of analysis.attributes) {
    if (attributeDirection(attribute.name) !== 'control-up') continue;
    const value = attribute.value;
    if (!value || value.trim().length === 0) continue;

    try {
      const { program } = parseTs(value, 'template-event.ts');
      if (!isNode(program)) continue;
      tallyExpression(
        program,
        memberNames,
        'control-up',
        locator.location(attribute.sourceSpan.start),
        tally
      );
    } catch (error: unknown) {
      debug('engine', `Visualize could not parse event binding ${attribute.name}: ${String(error)}`);
    }
  }
}

export function collectTemplateRefs(
  analysis: TemplateAnalysis,
  memberNames: ReadonlySet<string>,
  locator: Locator
): readonly TemplateRef[] {
  if (memberNames.size === 0) return [];

  const ranges = collectDirectedRanges(analysis);
  const tally = new Map<string, RefAccumulator>();

  for (const entry of analysis.expressions) {
    if (!isNode(entry.expression)) continue;
    const start = entry.sourceSpan.start;
    const direction = directionAt(ranges, start);
    tallyExpression(
      entry.expression,
      memberNames,
      direction,
      locator.location(start),
      tally
    );
  }

  tallyEventAttributes(analysis, memberNames, locator, tally);

  return Array.from(tally.values());
}
