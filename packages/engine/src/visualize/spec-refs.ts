import { Locator } from '@ngcompass/common';
import {
  MEMBER_TYPES,
  isNode,
  keyName,
  spanOffset,
  walkWithParent,
} from '../shared/ast-functions.js';
import { typeReferenceName } from './ts-members.js';
import type {
  AstNodeLike,
  SpecAnalysis,
  SpecTest,
} from '../models/index.js';

const TEST_CALLEES: ReadonlySet<string> = new Set(['it', 'test']);
const COMPONENT_INSTANCE = 'componentInstance';
const UNTITLED_TEST = '<untitled test>';

interface RefAccumulator {
  readonly testTitle: string;
  readonly testLine: number;
  readonly memberName: string;
  weight: number;
}

function stringArgument(args: unknown): string | undefined {
  if (!Array.isArray(args) || args.length === 0) return undefined;
  const first = args[0];
  if (!isNode(first)) return undefined;
  if (
    (first.type === 'Literal' || first.type === 'StringLiteral') &&
    typeof first.value === 'string'
  ) {
    return first.value;
  }
  return undefined;
}

function calleeIdentifier(callee: unknown): string | undefined {
  if (!isNode(callee)) return undefined;
  if (typeof callee.name === 'string') return callee.name;
  if (MEMBER_TYPES.has(callee.type) && isNode(callee.object)) {
    const objectName = callee.object.name;
    if (typeof objectName === 'string') return objectName;
  }
  return undefined;
}

function collectInstanceNames(
  program: AstNodeLike,
  className: string
): ReadonlySet<string> {
  const names = new Set<string>();

  walkWithParent(program, undefined, (node) => {
    if (node.type !== 'VariableDeclarator') return;
    const id = node.id;
    if (!isNode(id) || typeof id.name !== 'string') return;
    if (typeReferenceName(id) !== className) return;
    names.add(id.name);
  });

  return names;
}

function collectTests(program: AstNodeLike, locator: Locator): SpecTest[] {
  const tests: SpecTest[] = [];

  walkWithParent(program, undefined, (node) => {
    if (node.type !== 'CallExpression') return;
    const callee = calleeIdentifier(node.callee);
    if (!callee || !TEST_CALLEES.has(callee)) return;

    const start = spanOffset(node, 'start');
    const at = locator.location(start);
    tests.push({
      title: stringArgument(node.arguments) ?? UNTITLED_TEST,
      line: at.line,
      column: at.column,
      start,
      end: spanOffset(node, 'end'),
    });
  });

  return tests;
}

function enclosingTest(
  tests: readonly SpecTest[],
  offset: number
): SpecTest | undefined {
  let innermost: SpecTest | undefined;
  for (const test of tests) {
    if (test.start <= offset && offset < test.end) {
      if (!innermost || test.start > innermost.start) innermost = test;
    }
  }
  return innermost;
}

function isInstanceReceiver(
  object: unknown,
  instanceNames: ReadonlySet<string>
): boolean {
  if (!isNode(object)) return false;
  if (typeof object.name === 'string') return instanceNames.has(object.name);
  if (MEMBER_TYPES.has(object.type)) {
    return keyName(object.property) === COMPONENT_INSTANCE;
  }
  return false;
}

function tallyRefs(
  program: AstNodeLike,
  tests: readonly SpecTest[],
  instanceNames: ReadonlySet<string>,
  memberNames: ReadonlySet<string>,
  tally: Map<string, RefAccumulator>
): void {
  walkWithParent(program, undefined, (node) => {
    if (!MEMBER_TYPES.has(node.type)) return;
    if (node.computed === true) return;
    if (!isInstanceReceiver(node.object, instanceNames)) return;

    const memberName = keyName(node.property);
    if (!memberNames.has(memberName)) return;

    const owner = enclosingTest(tests, spanOffset(node, 'start'));
    if (!owner) return;

    const key = `${owner.line}:${memberName}`;
    const existing = tally.get(key);
    if (existing) {
      existing.weight++;
      return;
    }
    tally.set(key, {
      testTitle: owner.title,
      testLine: owner.line,
      memberName,
      weight: 1,
    });
  });
}

export function analyzeSpec(
  program: AstNodeLike,
  locator: Locator,
  className: string | null,
  memberNames: ReadonlySet<string>
): SpecAnalysis {
  const tests = collectTests(program, locator);
  if (!className || memberNames.size === 0) return { tests, refs: [] };

  const instanceNames = collectInstanceNames(program, className);
  const tally = new Map<string, RefAccumulator>();
  tallyRefs(program, tests, instanceNames, memberNames, tally);

  return { tests, refs: Array.from(tally.values()) };
}
