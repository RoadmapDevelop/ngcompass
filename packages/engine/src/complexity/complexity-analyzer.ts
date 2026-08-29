import type { Program } from 'oxc-parser';
import { Locator } from '@ngcompass/common';
import {
  FUNCTION_TYPES,
  NAMED_MEMBER_PARENTS,
  NON_CHILD_KEYS,
  appendChildNodes,
  isNode,
  resolveFunctionName,
  spanOffset,
  walkWithParent,
} from '../execution/ast-functions.js';
import type {
  AstNodeLike,
  FunctionComplexity,
} from '../models/index.js';


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

    appendChildNodes(node, stack);
  }

  return count;
}

function computeCognitive(body: AstNodeLike): number {
  let total = 0;

  const visitChildren = (node: AstNodeLike, nesting: number): void => {
    for (const key in node) {
      if (NON_CHILD_KEYS.has(key)) continue;
      const value = node[key];
      if (Array.isArray(value)) {
        for (let i = 0; i < value.length; i++) visit(value[i], nesting, null);
      } else {
        visit(value, nesting, null);
      }
    }
  };

  const visitNested = (node: AstNodeLike, nesting: number): void => {
    for (const key in node) {
      if (NON_CHILD_KEYS.has(key)) continue;
      const childNesting = key === 'body' ? nesting + 1 : nesting;
      const value = node[key];
      if (Array.isArray(value)) {
        for (let i = 0; i < value.length; i++) visit(value[i], childNesting, null);
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

  const visitIf = (value: AstNodeLike, nesting: number): void => {
    total += 1 + nesting;
    visit(value.test, nesting, null);
    visit(value.consequent, nesting + 1, null);
    visitElse(value.alternate, nesting);
  };

  const visitConditional = (value: AstNodeLike, nesting: number): void => {
    total += 1 + nesting;
    visit(value.test, nesting, null);
    visit(value.consequent, nesting + 1, null);
    visit(value.alternate, nesting + 1, null);
  };

  const visitSwitch = (value: AstNodeLike, nesting: number): void => {
    total += 1 + nesting;
    visit(value.discriminant, nesting, null);
    if (Array.isArray(value.cases)) {
      for (let i = 0; i < value.cases.length; i++) {
        visit(value.cases[i], nesting + 1, null);
      }
    }
  };

  const visitLogical = (
    value: AstNodeLike,
    nesting: number,
    parentOperator: string | null
  ): void => {
    const operator = typeof value.operator === 'string' ? value.operator : null;
    if (operator !== null && operator !== parentOperator) total += 1;
    visit(value.left, nesting, operator);
    visit(value.right, nesting, operator);
  };

  const visit = (
    value: unknown,
    nesting: number,
    parentLogicalOperator: string | null
  ): void => {
    if (!isNode(value)) return;
    const type = value.type;
    if (FUNCTION_TYPES.has(type)) return;
    if (type === 'IfStatement') return visitIf(value, nesting);
    if (type === 'ConditionalExpression') return visitConditional(value, nesting);
    if (type === 'SwitchStatement') return visitSwitch(value, nesting);
    if (type === 'LogicalExpression') {
      return visitLogical(value, nesting, parentLogicalOperator);
    }
    if (type === 'CatchClause' || LOOP_TYPES.has(type)) {
      total += 1 + nesting;
      visitNested(value, nesting);
      return;
    }
    visitChildren(value, nesting);
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

  const { name, kind } = resolveFunctionName(node, parent);

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

export function computeFileComplexity(
  program: Program,
  locator: Locator
): readonly FunctionComplexity[] {
  const out: FunctionComplexity[] = [];
  if (!isNode(program)) return out;

  walkWithParent(program, undefined, (node, parent) => {
    if (FUNCTION_TYPES.has(node.type)) recordFunction(node, parent, locator, out);
  });

  return out;
}
