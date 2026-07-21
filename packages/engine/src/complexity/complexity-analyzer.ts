import type { Program } from 'oxc-parser';
import { Locator } from '@ngcompass/common';

export type FunctionKind =
  | 'function'
  | 'method'
  | 'getter'
  | 'setter'
  | 'constructor'
  | 'arrow';

export interface FunctionComplexity {
  readonly name: string;
  readonly kind: FunctionKind;
  readonly line: number;
  readonly column: number;
  readonly endLine: number;
  readonly lineCount: number;
  readonly cyclomatic: number;
  readonly cognitive: number;
}

interface AstNodeLike {
  readonly type: string;
  readonly [key: string]: unknown;
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

const CYCLOMATIC_DECISIONS: ReadonlySet<string> = new Set([
  'IfStatement',
  'ForStatement',
  'ForInStatement',
  'ForOfStatement',
  'WhileStatement',
  'DoWhileStatement',
  'CatchClause',
  'ConditionalExpression',
]);

const LOOP_TYPES: ReadonlySet<string> = new Set([
  'ForStatement',
  'ForInStatement',
  'ForOfStatement',
  'WhileStatement',
  'DoWhileStatement',
]);

const LOGICAL_OPERATORS: ReadonlySet<string> = new Set(['&&', '||', '??']);

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
  if (
    target.type === 'MemberExpression' ||
    target.type === 'StaticMemberExpression'
  ) {
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
  }
  const ownName = identifierName(node.id);
  return { name: ownName || ANONYMOUS_NAME, kind: baseKind(node.type) };
}

function computeCyclomatic(body: AstNodeLike): number {
  let count = 1;
  const stack: AstNodeLike[] = [body];

  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) continue;

    if (node !== body && FUNCTION_TYPES.has(node.type)) continue;

    const type = node.type;
    if (CYCLOMATIC_DECISIONS.has(type)) {
      count++;
    } else if (type === 'SwitchCase') {
      if (isNode(node.test)) count++;
    } else if (type === 'LogicalExpression') {
      if (typeof node.operator === 'string' && LOGICAL_OPERATORS.has(node.operator)) {
        count++;
      }
    }

    for (const child of childNodesOf(node)) {
      stack.push(child);
    }
  }

  return count;
}

function computeCognitive(body: AstNodeLike): number {
  let total = 0;

  const visitNested = (node: AstNodeLike, nesting: number): void => {
    for (const key in node) {
      if (NON_CHILD_KEYS.has(key)) continue;
      const childNesting = key === 'body' ? nesting + 1 : nesting;
      const value = node[key];
      if (Array.isArray(value)) {
        for (const element of value) visit(element, childNesting, null);
      } else {
        visit(value, childNesting, null);
      }
    }
  };

  const visitElse = (alternate: unknown, nesting: number): void => {
    if (!isNode(alternate)) return;
    if (alternate.type === 'IfStatement') {
      total += 1;
      visit(alternate.test, nesting, null);
      visit(alternate.consequent, nesting + 1, null);
      visitElse(alternate.alternate, nesting);
      return;
    }
    total += 1;
    visit(alternate, nesting + 1, null);
  };

  const visit = (
    value: unknown,
    nesting: number,
    parentLogicalOperator: string | null
  ): void => {
    if (!isNode(value)) return;
    const type = value.type;
    if (FUNCTION_TYPES.has(type)) return;

    switch (type) {
      case 'IfStatement': {
        total += 1 + nesting;
        visit(value.test, nesting, null);
        visit(value.consequent, nesting + 1, null);
        visitElse(value.alternate, nesting);
        return;
      }
      case 'ConditionalExpression': {
        total += 1 + nesting;
        visit(value.test, nesting, null);
        visit(value.consequent, nesting + 1, null);
        visit(value.alternate, nesting + 1, null);
        return;
      }
      case 'SwitchStatement': {
        total += 1 + nesting;
        visit(value.discriminant, nesting, null);
        if (Array.isArray(value.cases)) {
          for (const switchCase of value.cases) visit(switchCase, nesting + 1, null);
        }
        return;
      }
      case 'LogicalExpression': {
        const operator =
          typeof value.operator === 'string' ? value.operator : null;
        if (operator !== null && operator !== parentLogicalOperator) {
          total += 1;
        }
        visit(value.left, nesting, operator);
        visit(value.right, nesting, operator);
        return;
      }
      case 'CatchClause': {
        total += 1 + nesting;
        visitNested(value, nesting);
        return;
      }
      default: {
        if (LOOP_TYPES.has(type)) {
          total += 1 + nesting;
          visitNested(value, nesting);
          return;
        }
        for (const child of childNodesOf(value)) {
          visit(child, nesting, null);
        }
      }
    }
  };

  visit(body, 0, null);
  return total;
}

function functionBody(node: AstNodeLike): AstNodeLike | undefined {
  return isNode(node.body) ? node.body : undefined;
}

function recordFunction(
  node: AstNodeLike,
  parent: AstNodeLike | undefined,
  locator: Locator,
  out: FunctionComplexity[]
): void {
  const body = functionBody(node);
  if (!body) return;

  const { name, kind } = resolveNameAndKind(node, parent);

  const locationNode =
    parent && NAMED_MEMBER_PARENTS.has(parent.type) ? parent : node;
  const start = locator.location(spanOffset(locationNode, 'start'));
  const end = locator.location(spanOffset(node, 'end'));

  out.push({
    name,
    kind,
    line: start.line,
    column: start.column,
    endLine: end.line,
    lineCount: end.line - start.line + 1,
    cyclomatic: computeCyclomatic(body),
    cognitive: computeCognitive(body),
  });
}

function collectFunctions(
  node: AstNodeLike,
  parent: AstNodeLike | undefined,
  locator: Locator,
  out: FunctionComplexity[]
): void {
  if (FUNCTION_TYPES.has(node.type)) {
    recordFunction(node, parent, locator, out);
  }
  for (const child of childNodesOf(node)) {
    collectFunctions(child, node, locator, out);
  }
}

export function computeFileComplexity(
  program: Program,
  locator: Locator
): readonly FunctionComplexity[] {
  const out: FunctionComplexity[] = [];
  if (isNode(program)) {
    collectFunctions(program, undefined, locator, out);
  }
  return out;
}
