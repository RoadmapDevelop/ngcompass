import type { Program } from 'oxc-parser';
import { Locator } from '@ngcompass/common';
import type { FunctionKind } from '../complexity/complexity-analyzer.js';

export interface CallGraphNode {
  readonly id: string;
  readonly name: string;
  readonly kind: FunctionKind;
  readonly line: number;
  readonly column: number;
  readonly endLine: number;
}

export interface CallGraphEdge {
  readonly from: string;
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

interface AstNodeLike {
  readonly type: string;
  readonly [key: string]: unknown;
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

const ANONYMOUS_NAME = '<anonymous>';

const NON_CHILD_KEYS: ReadonlySet<string> = new Set([
  'type',
  'start',
  'end',
  'span',
  'loc',
  'range',
  'parent',
]);

const FUNCTION_TYPES: ReadonlySet<string> = new Set([
  'FunctionDeclaration',
  'FunctionExpression',
  'ArrowFunctionExpression',
]);

const CALL_TYPES: ReadonlySet<string> = new Set([
  'CallExpression',
  'NewExpression',
]);

const MEMBER_TYPES: ReadonlySet<string> = new Set([
  'MemberExpression',
  'StaticMemberExpression',
]);

const NAMED_MEMBER_PARENTS: ReadonlySet<string> = new Set([
  'MethodDefinition',
  'PropertyDefinition',
  'Property',
]);

function spanOffset(node: AstNodeLike, key: 'start' | 'end'): number {
  const direct = node[key];
  if (typeof direct === 'number') return direct;
  const span = node.span;
  if (typeof span === 'object' && span !== null) {
    const value = (span as { readonly [k: string]: unknown })[key];
    if (typeof value === 'number') return value;
  }
  return 0;
}

function isNode(value: unknown): value is AstNodeLike {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { type?: unknown }).type === 'string'
  );
}

function* childNodesOf(node: AstNodeLike): Iterable<AstNodeLike> {
  for (const key in node) {
    if (NON_CHILD_KEYS.has(key)) continue;
    const value = node[key];
    if (Array.isArray(value)) {
      for (const element of value) {
        if (isNode(element)) yield element;
      }
    } else if (isNode(value)) {
      yield value;
    }
  }
}

function keyName(key: unknown): string {
  if (!isNode(key)) return ANONYMOUS_NAME;
  if (key.type === 'Identifier' && typeof key.name === 'string') return key.name;
  if (key.type === 'PrivateIdentifier' && typeof key.name === 'string') {
    return `#${key.name}`;
  }
  if (
    (key.type === 'Literal' || key.type === 'StringLiteral') &&
    typeof key.value === 'string'
  ) {
    return key.value;
  }
  return ANONYMOUS_NAME;
}

function identifierName(id: unknown): string {
  if (isNode(id) && id.type === 'Identifier' && typeof id.name === 'string') {
    return id.name;
  }
  return '';
}

function assignmentTargetName(target: unknown): string {
  if (!isNode(target)) return ANONYMOUS_NAME;
  if (target.type === 'Identifier' && typeof target.name === 'string') {
    return target.name;
  }
  if (MEMBER_TYPES.has(target.type)) {
    return keyName(target.property);
  }
  return ANONYMOUS_NAME;
}

function baseKind(type: string): FunctionKind {
  return type === 'ArrowFunctionExpression' ? 'arrow' : 'function';
}

function methodKind(rawKind: unknown): FunctionKind {
  if (rawKind === 'get') return 'getter';
  if (rawKind === 'set') return 'setter';
  if (rawKind === 'constructor') return 'constructor';
  return 'method';
}

function resolveNameAndKind(
  node: AstNodeLike,
  parent: AstNodeLike | undefined
): { readonly name: string; readonly kind: FunctionKind } {
  if (parent) {
    if (parent.type === 'MethodDefinition') {
      return { name: keyName(parent.key), kind: methodKind(parent.kind) };
    }
    if (parent.type === 'PropertyDefinition') {
      return { name: keyName(parent.key), kind: baseKind(node.type) };
    }
    if (parent.type === 'Property') {
      if (parent.kind === 'get') return { name: keyName(parent.key), kind: 'getter' };
      if (parent.kind === 'set') return { name: keyName(parent.key), kind: 'setter' };
      const kind = parent.method === true ? 'method' : baseKind(node.type);
      return { name: keyName(parent.key), kind };
    }
    if (parent.type === 'VariableDeclarator') {
      return { name: identifierName(parent.id) || ANONYMOUS_NAME, kind: baseKind(node.type) };
    }
    if (parent.type === 'AssignmentExpression' && parent.operator === '=') {
      return { name: assignmentTargetName(parent.left), kind: baseKind(node.type) };
    }
    if (parent.type === 'CallExpression' || parent.type === 'NewExpression') {
      const own = identifierName(node.id);
      if (own) return { name: own, kind: baseKind(node.type) };
      if (parent.callee !== node) {
        const callee = calleeName(parent.callee);
        if (callee) {
          return { name: `${callee} callback`, kind: baseKind(node.type) };
        }
      }
    }
  }
  const ownName = identifierName(node.id);
  return { name: ownName || ANONYMOUS_NAME, kind: baseKind(node.type) };
}

function collectDefinitions(
  node: AstNodeLike,
  parent: AstNodeLike | undefined,
  locator: Locator,
  out: Definition[]
): void {
  if (FUNCTION_TYPES.has(node.type)) {
    const { name, kind } = resolveNameAndKind(node, parent);
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
  }
  for (const child of childNodesOf(node)) {
    collectDefinitions(child, node, locator, out);
  }
}

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
  node: AstNodeLike,
  definitions: readonly Definition[],
  nameIndex: ReadonlyMap<string, readonly string[]>,
  locator: Locator,
  edges: CallGraphEdge[],
  externalCalls: ExternalCall[]
): void {
  if (CALL_TYPES.has(node.type)) {
    const name = calleeName(node.callee);
    if (name !== undefined) {
      const offset = spanOffset(node, 'start');
      const at = locator.location(offset);
      const from = enclosingId(definitions, offset);
      const targets = nameIndex.get(name);
      if (targets && targets.length > 0 && from !== null) {
        const ambiguous = targets.length > 1;
        for (const to of targets) {
          edges.push({
            from,
            to,
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
    }
  }
  for (const child of childNodesOf(node)) {
    collectCalls(child, definitions, nameIndex, locator, edges, externalCalls);
  }
}

export function computeFileCallGraph(
  program: Program,
  locator: Locator
): FileCallGraph {
  if (!isNode(program)) {
    return { nodes: [], edges: [], externalCalls: [] };
  }

  const definitions: Definition[] = [];
  collectDefinitions(program, undefined, locator, definitions);

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
