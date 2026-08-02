export type FunctionKind =
  | 'function'
  | 'method'
  | 'getter'
  | 'setter'
  | 'constructor'
  | 'arrow';

export interface AstNodeLike {
  readonly type: string;
  readonly [key: string]: unknown;
}

export interface NamedFunction {
  readonly name: string;
  readonly kind: FunctionKind;
}

export const ANONYMOUS_NAME = '<anonymous>';

export const NON_CHILD_KEYS: ReadonlySet<string> = new Set([
  'type',
  'start',
  'end',
  'span',
  'loc',
  'range',
  'parent',
]);

export const FUNCTION_TYPES: ReadonlySet<string> = new Set([
  'FunctionDeclaration',
  'FunctionExpression',
  'ArrowFunctionExpression',
]);

export const NAMED_MEMBER_PARENTS: ReadonlySet<string> = new Set([
  'MethodDefinition',
  'PropertyDefinition',
  'Property',
]);

export const MEMBER_TYPES: ReadonlySet<string> = new Set([
  'MemberExpression',
  'StaticMemberExpression',
]);

export function isNode(value: unknown): value is AstNodeLike {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { type?: unknown }).type === 'string'
  );
}

export function spanOffset(node: AstNodeLike, key: 'start' | 'end'): number {
  const direct = node[key];
  if (typeof direct === 'number') return direct;
  const span = node.span;
  if (typeof span === 'object' && span !== null) {
    const value = (span as { readonly [k: string]: unknown })[key];
    if (typeof value === 'number') return value;
  }
  return 0;
}

export function appendChildNodes(node: AstNodeLike, out: AstNodeLike[]): void {
  for (const key in node) {
    if (NON_CHILD_KEYS.has(key)) continue;
    const value = node[key];
    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        const element = value[i];
        if (isNode(element)) out.push(element);
      }
    } else if (isNode(value)) {
      out.push(value);
    }
  }
}

export type NodeVisitor = (
  node: AstNodeLike,
  parent: AstNodeLike | undefined
) => void;

export function walkWithParent(
  node: AstNodeLike,
  parent: AstNodeLike | undefined,
  visit: NodeVisitor
): void {
  visit(node, parent);
  for (const key in node) {
    if (NON_CHILD_KEYS.has(key)) continue;
    const value = node[key];
    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        const element = value[i];
        if (isNode(element)) walkWithParent(element, node, visit);
      }
    } else if (isNode(value)) {
      walkWithParent(value, node, visit);
    }
  }
}

export function keyName(key: unknown): string {
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

export function identifierName(id: unknown): string {
  if (isNode(id) && id.type === 'Identifier' && typeof id.name === 'string') {
    return id.name;
  }
  return '';
}

export function baseKind(type: string): FunctionKind {
  return type === 'ArrowFunctionExpression' ? 'arrow' : 'function';
}

function methodKind(rawKind: unknown): FunctionKind {
  if (rawKind === 'get') return 'getter';
  if (rawKind === 'set') return 'setter';
  if (rawKind === 'constructor') return 'constructor';
  return 'method';
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

function resolvePropertyFunction(
  parent: AstNodeLike,
  node: AstNodeLike
): NamedFunction {
  if (parent.kind === 'get') return { name: keyName(parent.key), kind: 'getter' };
  if (parent.kind === 'set') return { name: keyName(parent.key), kind: 'setter' };
  const kind = parent.method === true ? 'method' : baseKind(node.type);
  return { name: keyName(parent.key), kind };
}

export function resolveFunctionName(
  node: AstNodeLike,
  parent: AstNodeLike | undefined
): NamedFunction {
  if (parent) {
    if (parent.type === 'MethodDefinition') {
      return { name: keyName(parent.key), kind: methodKind(parent.kind) };
    }
    if (parent.type === 'PropertyDefinition') {
      return { name: keyName(parent.key), kind: baseKind(node.type) };
    }
    if (parent.type === 'Property') {
      return resolvePropertyFunction(parent, node);
    }
    if (parent.type === 'VariableDeclarator') {
      return {
        name: identifierName(parent.id) || ANONYMOUS_NAME,
        kind: baseKind(node.type),
      };
    }
    if (parent.type === 'AssignmentExpression' && parent.operator === '=') {
      return { name: assignmentTargetName(parent.left), kind: baseKind(node.type) };
    }
  }
  return { name: identifierName(node.id) || ANONYMOUS_NAME, kind: baseKind(node.type) };
}
