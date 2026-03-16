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

/**
 * Returns true when the node is a function-like node that creates a new scope.
 */
function isFunctionBoundaryNode(node: AstNode): boolean {
    return !!node.type && FUNCTION_NODE_TYPES.has(node.type);
}

/**
 * Returns true when the node is a `.subscribe()` call.
 */
function isSubscribeCall(node: AstNode): boolean {
    if (node.type !== 'CallExpression') {
        return false;
    }

    const callee = unwrapNode(node.callee);
    if (!isMemberExpressionLike(callee)) {
        return false;
    }

    return getStaticPropertyName(callee) === SUBSCRIBE_METHOD;
}

/**
 * Returns true when the node is a function expression accepted by `subscribe(...)`.
 */
function isSubscribeHandler(node: AstNode | null | undefined): node is AstNode {
    if (!node) {
        return false;
    }

    return (
        node.type === 'ArrowFunctionExpression' ||
        node.type === 'FunctionExpression'
    );
}

/**
 * Returns the static property name for an object property node.
 */
function getObjectPropertyName(node: AstNode): string {
    const key = unwrapNode((node as AstNode & { key?: AstNode }).key);
    if (!key) {
        return '';
    }

    if (key.type === 'Identifier') {
        return key.name as string;
    }

    return getStaticPropertyName(key) || '';
}

/**
 * Collects positional subscribe handlers:
 *   subscribe(next)
 *   subscribe(next, error)
 *   subscribe(next, error, complete)
 */
function getPositionalSubscribeHandlers(node: AstNode): AstNode[] {
    if (node.type !== 'CallExpression') {
        return [];
    }

    const handlers: AstNode[] = [];
    const args = Array.isArray(node.arguments) ? node.arguments : [];

    for (let i = 0; i < Math.min(args.length, 3); i += 1) {
        const arg = unwrapNode(args[i] as AstNode);
        if (isSubscribeHandler(arg)) {
            handlers.push(arg);
        }
    }

    return handlers;
}

/**
 * Collects observer-object handlers:
 *   subscribe({ next, error, complete })
 */
function getObserverSubscribeHandlers(node: AstNode): AstNode[] {
    if (node.type !== 'CallExpression') {
        return [];
    }

    const args = Array.isArray(node.arguments) ? node.arguments : [];
    const firstArg = unwrapNode(args[0] as AstNode);

    if (!firstArg || firstArg.type !== 'ObjectExpression') {
        return [];
    }

    const handlers: AstNode[] = [];
    const properties = Array.isArray(firstArg.properties) ? firstArg.properties : [];

    for (const propertyNode of properties) {
        const property = unwrapNode(propertyNode as AstNode);
        if (!property || property.type !== 'Property') {
            continue;
        }

        const propertyName = getObjectPropertyName(property);
        if (!OBSERVER_HANDLER_NAMES.has(propertyName)) {
            continue;
        }

        const value = unwrapNode((property as AstNode & { value?: AstNode }).value);
        if (isSubscribeHandler(value)) {
            handlers.push(value);
        }
    }

    return handlers;
}

/**
 * Returns all callback handlers supplied to `.subscribe(...)`.
 */
function getSubscribeHandlers(node: AstNode): AstNode[] {
    if (!isSubscribeCall(node)) {
        return [];
    }

    const positionalHandlers = getPositionalSubscribeHandlers(node);
    const observerHandlers = getObserverSubscribeHandlers(node);

    return [...positionalHandlers, ...observerHandlers];
}

/**
 * Returns the traversable body node for a subscribe handler.
 */
function getHandlerBodyNode(handler: AstNode): AstNode | null {
    const body = unwrapNode((handler as AstNode & { body?: AstNode }).body);
    return body ?? null;
}

/**
 * Returns true when the search should stop at the current node.
 */
function shouldStopNestedTraversal(node: AstNode, root: AstNode): boolean {
    if (node === root) {
        return false;
    }

    return isFunctionBoundaryNode(node);
}

/**
 * Returns true when the node subtree contains a nested `.subscribe()` call.
 *
 * Traversal stops at nested function boundaries to avoid reporting helper
 * functions or independently scoped callbacks as direct nested subscribes.
 */
function containsNestedSubscribeInNode(root: AstNode): boolean {
    const stack: AstNode[] = [root];

    while (stack.length > 0) {
        const current = stack.pop()!;
        const node = unwrapNode(current);
        if (!node) {
            continue;
        }

        if (node !== root && isSubscribeCall(node)) {
            return true;
        }

        if (shouldStopNestedTraversal(node, root)) {
            continue;
        }

        for (const child of childNodes(node)) {
            stack.push(child);
        }
    }

    return false;
}

/**
 * Returns true when any subscribe handler contains a nested subscribe call.
 */
function hasNestedSubscribeInHandlers(node: AstNode): boolean {
    const handlers = getSubscribeHandlers(node);

    for (const handler of handlers) {
        const body = getHandlerBodyNode(handler);
        if (!body) {
            continue;
        }

        if (containsNestedSubscribeInNode(body)) {
            return true;
        }
    }

    return false;
}

/**
 * Creates a rule failure for a nested subscribe call.
 */
function createNestedSubscribeFailure(
    node: AstNode,
    context: RuleContext,
): RuleFailure {
    const start = getNodeStart(node);
    const { line, column } = context.locator.location(start);

    return {
        filePath: context.filePath,
        ruleName: RULE_NAME,
        message:
            'Avoid nesting `.subscribe()` inside another `.subscribe()`. Prefer higher-order RxJS composition such as `switchMap`, `mergeMap`, `concatMap`, or `exhaustMap`.',
        line,
        column,
        severity: 'error',
        fix: RECOMMENDATIONS[RULE_NAME],
        codeExample: CODE_EXAMPLES[RULE_NAME],
    };
}

/**
 * Flags `.subscribe()` calls whose handlers contain another `.subscribe()` call.
 */
export const rxjsNoNestedSubscribeRule = createCallExpressionRule(
    RULE_NAME,
    (node: CallExpression, context: RuleContext): RuleFailure | null => {
        const astNode = node as unknown as AstNode;

        if (!isSubscribeCall(astNode)) {
            return null;
        }

        if (!hasNestedSubscribeInHandlers(astNode)) {
            return null;
        }

        return createNestedSubscribeFailure(astNode, context);
    },
);