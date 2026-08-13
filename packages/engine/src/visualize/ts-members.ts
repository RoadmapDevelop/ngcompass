import { Locator } from '@ngcompass/common';
import {
  isNode,
  keyName,
  spanOffset,
  walkWithParent,
} from '../shared/ast-functions.js';
import type { BoxKind } from './unit-graph.js';
import type {
  AstNodeLike,
  EntryClassInfo,
  InjectedDependency,
  MemberSpan,
} from '../models/index.js';
const METHOD_KINDS: ReadonlyMap<string, BoxKind> = new Map([
  ['get', 'getter'],
  ['set', 'setter'],
  ['constructor', 'constructor'],
  ['method', 'method'],
]);

const INJECT_CALLEE = 'inject';

export function typeReferenceName(annotated: unknown): string | undefined {
  if (!isNode(annotated)) return undefined;
  const annotation = annotated.typeAnnotation;
  if (!isNode(annotation)) return undefined;
  const inner = annotation.typeAnnotation;
  if (!isNode(inner) || inner.type !== 'TSTypeReference') return undefined;
  const typeName = inner.typeName;
  if (!isNode(typeName) || typeof typeName.name !== 'string') return undefined;
  return typeName.name;
}

function injectCallTypeName(value: unknown): string | undefined {
  if (!isNode(value) || value.type !== 'CallExpression') return undefined;
  const callee = value.callee;
  if (!isNode(callee) || callee.name !== INJECT_CALLEE) return undefined;
  const args = value.arguments;
  if (!Array.isArray(args) || args.length === 0) return undefined;
  const first = args[0];
  if (!isNode(first) || typeof first.name !== 'string') return undefined;
  return first.name;
}

function parameterIdentifier(parameter: unknown): AstNodeLike | undefined {
  if (!isNode(parameter)) return undefined;
  if (parameter.type === 'Identifier') return parameter;
  if (parameter.type === 'AssignmentPattern' && isNode(parameter.left)) {
    return parameter.left;
  }
  return undefined;
}

function collectParameterProperties(
  method: AstNodeLike,
  out: InjectedDependency[]
): void {
  const value = method.value;
  if (!isNode(value) || !Array.isArray(value.params)) return;

  for (const param of value.params) {
    if (!isNode(param) || param.type !== 'TSParameterProperty') continue;
    const identifier = parameterIdentifier(param.parameter);
    if (!identifier || typeof identifier.name !== 'string') continue;
    const typeName = typeReferenceName(identifier);
    if (!typeName) continue;
    out.push({ propertyName: identifier.name, typeName });
  }
}

function toMemberSpan(
  node: AstNodeLike,
  name: string,
  kind: BoxKind,
  locator: Locator
): MemberSpan {
  const start = spanOffset(node, 'start');
  const end = spanOffset(node, 'end');
  const at = locator.location(start);
  return {
    name,
    kind,
    line: at.line,
    column: at.column,
    endLine: locator.location(end).line,
    start,
    end,
  };
}

function readMethod(
  node: AstNodeLike,
  locator: Locator,
  members: MemberSpan[],
  injected: InjectedDependency[]
): void {
  const rawKind = typeof node.kind === 'string' ? node.kind : 'method';
  const kind = METHOD_KINDS.get(rawKind) ?? 'method';
  members.push(toMemberSpan(node, keyName(node.key), kind, locator));
  if (kind === 'constructor') collectParameterProperties(node, injected);
}

function readProperty(
  node: AstNodeLike,
  locator: Locator,
  members: MemberSpan[],
  injected: InjectedDependency[]
): void {
  const name = keyName(node.key);
  const injectedType = injectCallTypeName(node.value);
  const kind: BoxKind = injectedType ? 'injected' : 'field';
  members.push(toMemberSpan(node, name, kind, locator));
  if (injectedType) injected.push({ propertyName: name, typeName: injectedType });
}

function readClassBody(
  classNode: AstNodeLike,
  locator: Locator,
  members: MemberSpan[],
  injected: InjectedDependency[]
): void {
  const body = classNode.body;
  if (!isNode(body) || !Array.isArray(body.body)) return;

  for (const element of body.body) {
    if (!isNode(element)) continue;
    if (element.type === 'MethodDefinition') {
      readMethod(element, locator, members, injected);
    } else if (element.type === 'PropertyDefinition') {
      readProperty(element, locator, members, injected);
    }
  }
}

function hasDecorators(node: AstNodeLike): boolean {
  return Array.isArray(node.decorators) && node.decorators.length > 0;
}

function findEntryClass(program: AstNodeLike): AstNodeLike | undefined {
  let firstClass: AstNodeLike | undefined;

  walkWithParent(program, undefined, (node) => {
    if (node.type !== 'ClassDeclaration' && node.type !== 'ClassExpression') {
      return;
    }
    if (!firstClass) firstClass = node;
    if (hasDecorators(node) && !hasDecorators(firstClass)) firstClass = node;
  });

  return firstClass;
}

function collectTopLevelFunctions(
  program: AstNodeLike,
  locator: Locator,
  members: MemberSpan[]
): void {
  if (!Array.isArray(program.body)) return;

  for (const statement of program.body) {
    if (!isNode(statement)) continue;
    const declaration =
      statement.type === 'ExportNamedDeclaration' && isNode(statement.declaration)
        ? statement.declaration
        : statement;
    if (declaration.type !== 'FunctionDeclaration') continue;
    const name = isNode(declaration.id) && typeof declaration.id.name === 'string'
      ? declaration.id.name
      : '';
    if (!name) continue;
    members.push(toMemberSpan(declaration, name, 'function', locator));
  }
}

export function readEntryClass(
  program: AstNodeLike,
  locator: Locator
): EntryClassInfo {
  const members: MemberSpan[] = [];
  const injected: InjectedDependency[] = [];
  const classNode = findEntryClass(program);

  if (classNode) readClassBody(classNode, locator, members, injected);
  collectTopLevelFunctions(program, locator, members);

  const className =
    classNode && isNode(classNode.id) && typeof classNode.id.name === 'string'
      ? classNode.id.name
      : null;

  return { className, members, injected };
}

export function ownerOfOffset(
  members: readonly MemberSpan[],
  offset: number
): MemberSpan | undefined {
  let innermost: MemberSpan | undefined;
  for (const member of members) {
    if (member.start <= offset && offset < member.end) {
      if (!innermost || member.start > innermost.start) innermost = member;
    }
  }
  return innermost;
}

export function ownerOfLine(
  members: readonly MemberSpan[],
  line: number
): MemberSpan | undefined {
  let innermost: MemberSpan | undefined;
  for (const member of members) {
    if (member.line <= line && line <= member.endLine) {
      if (!innermost || member.line > innermost.line) innermost = member;
    }
  }
  return innermost;
}
