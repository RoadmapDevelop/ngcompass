import { CallExpression } from '@ngcompass/ast';
import { RuleContext, RuleFailure } from '@ngcompass/common';
import { createCallExpressionRule } from '@ngcompass/engine';
import { CODE_EXAMPLES, RECOMMENDATIONS } from '../../recommendations';
import {
  AstNode,
  childNodes,
  getNodeStart,
  getStaticPropertyName,
  isMemberExpressionLike,
  unwrapNode,
} from '../../rule-utils';

const RULE_NAME = 'rxjs-no-nested-subscribe';
const SUBSCRIBE_METHOD = 'subscribe';
const OBSERVER_HANDLER_NAMES = new Set(['next', 'error', 'complete']);
const FUNCTION_NODE_TYPES = new Set([
  'ArrowFunctionExpression',
  'FunctionExpression',
  'FunctionDeclaration',
]);

function isFunctionBoundaryNode(node: AstNode): boolean {
  return !!node.type && FUNCTION_NODE_TYPES.has(node.type);
}

function isSubscribeCall(node: AstNode): boolean {
  if (node.type !== 'CallExpression') return false;

  const callee = unwrapNode(node.callee);
  if (!isMemberExpressionLike(callee)) return false;

  return getStaticPropertyName(callee) === SUBSCRIBE_METHOD;
}

function isSubscribeHandler(node: AstNode | null | undefined): node is AstNode {
  if (!node) return false;
  return (
    node.type === 'ArrowFunctionExpression' ||
    node.type === 'FunctionExpression'
  );
}

function getObjectPropertyName(node: AstNode): string {
  const key = unwrapNode(node.key);
  if (!key) return '';
  return key.type === 'Identifier'
    ? (key.name as string)
    : getStaticPropertyName(key) || '';
}

function getHandlersFromArgs(args: ReadonlyArray<AstNode>): AstNode[] {
  const handlers: AstNode[] = [];
  for (let i = 0; i < Math.min(args.length, 3); i++) {
    const arg = unwrapNode(args[i]);
    if (isSubscribeHandler(arg)) handlers.push(arg);
  }
  return handlers;
}

function getHandlersFromObserver(observer: AstNode): AstNode[] {
  if (observer.type !== 'ObjectExpression') return [];

  const handlers: AstNode[] = [];
  const properties = Array.isArray(observer.properties)
    ? observer.properties
    : [];

  for (const propertyNode of properties) {
    const property = unwrapNode(propertyNode);
    if (
      property?.type === 'Property' &&
      OBSERVER_HANDLER_NAMES.has(getObjectPropertyName(property))
    ) {
      const value = unwrapNode(property.value as AstNode);
      if (isSubscribeHandler(value)) handlers.push(value);
    }
  }
  return handlers;
}

function getSubscribeHandlers(node: AstNode): AstNode[] {
  if (!isSubscribeCall(node)) return [];

  const args = Array.isArray(node.arguments) ? node.arguments : [];
  if (args.length === 0) return [];

  const firstArg = unwrapNode(args[0]);
  if (firstArg?.type === 'ObjectExpression') {
    return getHandlersFromObserver(firstArg);
  }

  return getHandlersFromArgs(args);
}

function containsNestedSubscribe(root: AstNode): boolean {
  const stack: AstNode[] = [root];

  while (stack.length > 0) {
    const node = unwrapNode(stack.pop());
    if (!node) continue;

    if (node !== root && isSubscribeCall(node)) return true;
    if (node !== root && isFunctionBoundaryNode(node)) continue;

    for (const child of childNodes(node)) {
      stack.push(child);
    }
  }

  return false;
}

function createFailure(node: AstNode, context: RuleContext): RuleFailure {
  const start = getNodeStart(node);
  const { line, column } = context.locator.location(start);

  return {
    filePath: context.filePath,
    ruleName: RULE_NAME,
    message:
      'Nested subscribe() calls make stream lifetimes harder to reason about and can leak work.',
    line,
    column,
    severity: 'error',
    fix: RECOMMENDATIONS[RULE_NAME],
    codeExample: CODE_EXAMPLES[RULE_NAME],
  };
}

export const rxjsNoNestedSubscribeRule = createCallExpressionRule(
  RULE_NAME,
  (node: CallExpression, context: RuleContext): RuleFailure | null => {
    const astNode = node as unknown as AstNode;

    if (!isSubscribeCall(astNode)) return null;

    const handlers = getSubscribeHandlers(astNode);
    for (const handler of handlers) {
      const body = unwrapNode(handler.body as AstNode);
      if (body && containsNestedSubscribe(body)) {
        return createFailure(astNode, context);
      }
    }

    return null;
  }
);
