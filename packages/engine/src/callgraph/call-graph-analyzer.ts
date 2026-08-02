import type { Program } from 'oxc-parser';
import { Locator } from '@ngcompass/common';
import {
  type AstNodeLike,
  type FunctionKind,
  type NamedFunction,
  ANONYMOUS_NAME,
  FUNCTION_TYPES,
  MEMBER_TYPES,
  NAMED_MEMBER_PARENTS,
  baseKind,
  identifierName,
  isNode,
  keyName,
  resolveFunctionName,
  spanOffset,
  walkWithParent,
} from '../shared/ast-functions.js';

export interface CallGraphNode {
  readonly id: string;
  readonly name: string;
  readonly kind: FunctionKind;
  readonly line: number;
  readonly column: number;
  readonly endLine: number;
}

export interface CallGraphEdge {
  readonly from: string | null;
  readonly to: string;
  readonly callName: string;
  readonly line: number;
  readonly column: number;
  readonly ambiguous: boolean;
}

export interface ExternalCall {
  readonly from: string | null;
  readonly callName: string;
  readonly line: number;
  readonly column: number;
}

export interface FileCallGraph {
  readonly nodes: readonly CallGraphNode[];
  readonly edges: readonly CallGraphEdge[];
  readonly externalCalls: readonly ExternalCall[];
}

interface Definition {
  readonly id: string;
  readonly name: string;
  readonly kind: FunctionKind;
  readonly start: number;
  readonly end: number;
  readonly line: number;
  readonly column: number;
  readonly endLine: number;
}

const CALL_TYPES: ReadonlySet<string> = new Set([
  'CallExpression',
  'NewExpression',
]);

function calleeName(callee: unknown): string | undefined {
  if (!isNode(callee)) return undefined;
  if (callee.type === 'Identifier' && typeof callee.name === 'string') {
    return callee.name;
  }
  if (MEMBER_TYPES.has(callee.type)) {
    const name = keyName(callee.property);
    return name === ANONYMOUS_NAME ? undefined : name;
  }
  return undefined;
}

function resolveDefinition(
  node: AstNodeLike,
  parent: AstNodeLike | undefined
): NamedFunction {
  if (parent && CALL_TYPES.has(parent.type)) {
    const own = identifierName(node.id);
    if (own) return { name: own, kind: baseKind(node.type) };
    if (parent.callee !== node) {
      const callee = calleeName(parent.callee);
      if (callee) return { name: `${callee} callback`, kind: baseKind(node.type) };
    }
  }
  return resolveFunctionName(node, parent);
}

function collectDefinitions(
  program: AstNodeLike,
  locator: Locator,
  out: Definition[]
): void {
  walkWithParent(program, undefined, (node, parent) => {
    if (!FUNCTION_TYPES.has(node.type)) return;
    const { name, kind } = resolveDefinition(node, parent);
    const locationNode =
      parent && NAMED_MEMBER_PARENTS.has(parent.type) ? parent : node;
    const start = locator.location(spanOffset(locationNode, 'start'));
    const end = locator.location(spanOffset(node, 'end'));
    out.push({
      id: `${name}@${start.line}:${start.column}`,
      name,
      kind,
      start: spanOffset(node, 'start'),
      end: spanOffset(node, 'end'),
      line: start.line,
      column: start.column,
      endLine: end.line,
    });
  });
}

function enclosingId(
  definitions: readonly Definition[],
  offset: number
): string | null {
  let innermost: Definition | undefined;
  for (const def of definitions) {
    if (def.start <= offset && offset < def.end) {
      if (!innermost || def.start > innermost.start) innermost = def;
    }
  }
  return innermost ? innermost.id : null;
}

function buildNameIndex(
  definitions: readonly Definition[]
): ReadonlyMap<string, readonly string[]> {
  const index = new Map<string, string[]>();
  for (const def of definitions) {
    const existing = index.get(def.name);
    if (existing) {
      existing.push(def.id);
    } else {
      index.set(def.name, [def.id]);
    }
  }
  return index;
}

function collectCalls(
  program: AstNodeLike,
  definitions: readonly Definition[],
  nameIndex: ReadonlyMap<string, readonly string[]>,
  locator: Locator,
  edges: CallGraphEdge[],
  externalCalls: ExternalCall[]
): void {
  walkWithParent(program, undefined, (node) => {
    if (!CALL_TYPES.has(node.type)) return;
    const name = calleeName(node.callee);
    if (name === undefined) return;

    const offset = spanOffset(node, 'start');
    const at = locator.location(offset);
    const from = enclosingId(definitions, offset);
    const targets = nameIndex.get(name);

    if (targets && targets.length > 0) {
      const ambiguous = targets.length > 1;
      for (let i = 0; i < targets.length; i++) {
        edges.push({
          from,
          to: targets[i],
          callName: name,
          line: at.line,
          column: at.column,
          ambiguous,
        });
      }
    } else {
      externalCalls.push({
        from,
        callName: name,
        line: at.line,
        column: at.column,
      });
    }
  });
}

export function computeFileCallGraph(
  program: Program,
  locator: Locator
): FileCallGraph {
  if (!isNode(program)) {
    return { nodes: [], edges: [], externalCalls: [] };
  }

  const definitions: Definition[] = [];
  collectDefinitions(program, locator, definitions);

  const nameIndex = buildNameIndex(definitions);
  const edges: CallGraphEdge[] = [];
  const externalCalls: ExternalCall[] = [];
  collectCalls(program, definitions, nameIndex, locator, edges, externalCalls);

  const nodes: CallGraphNode[] = definitions.map((def) => ({
    id: def.id,
    name: def.name,
    kind: def.kind,
    line: def.line,
    column: def.column,
    endLine: def.endLine,
  }));

  return { nodes, edges, externalCalls };
}
