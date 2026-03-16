import { CallExpression } from '@ngcompass/ast';
import { RuleContext, RuleFailure } from '@ngcompass/common';
import { createCallExpressionRule } from '@ngcompass/engine';

import { RECOMMENDATIONS } from '../../recommendations';
import {
    AstNode,
    MaybeAstNode,
    childNodes,
    getCallbackArg,
    getFunctionBody,
    getNodeStart,
    getStaticPropertyName,
    isCalleeNamed,
    isMemberExpressionLike,
    unwrapNode,
} from '../../rule-utils';

const RULE_NAME = 'signal-no-side-effects-in-computed';

const SIDE_EFFECT_METHODS = new Set([
    'post',
    'put',
    'patch',
    'subscribe',
    'unsubscribe',
    'next',
    'complete',
    'setItem',
    'removeItem',
    'appendChild',
    'removeChild',
    'dispatch',
]);

const WRITE_METHODS = new Set(['set', 'update', 'mutate']);

const FUNCTION_NODE_TYPES = new Set([
    'ArrowFunctionExpression',
    'FunctionExpression',
    'FunctionDeclaration',
]);

type ViolationType = 'write' | 'effect';

type Violation = {
    node: AstNode;
    type: ViolationType;
};

/**
 * Returns true when the node introduces a nested function scope.
 */
function isFunctionBoundaryNode(node: AstNode): boolean {
    return !!node.type && FUNCTION_NODE_TYPES.has(node.type);
}

/**
 * Returns the static member name for a call expression callee.
 */
function getCalledMemberName(node: MaybeAstNode): string {
    const call = unwrapNode(node);
    if (!call || call.type !== 'CallExpression') {
        return '';
    }

    const callee = unwrapNode(call.callee);
    if (!isMemberExpressionLike(callee)) {
        return '';
    }

    return getStaticPropertyName(callee) || '';
}

/**
 * Returns true when the call expression invokes a known write method.
 */
function isWriteMethodCall(node: MaybeAstNode): boolean {
    const methodName = getCalledMemberName(node);
    return WRITE_METHODS.has(methodName);
}

/**
 * Returns true when the call expression invokes a known side-effect method.
 */
function isSideEffectMethodCall(node: MaybeAstNode): boolean {
    const methodName = getCalledMemberName(node);
    return SIDE_EFFECT_METHODS.has(methodName);
}

/**
 * Returns true when the node is a member assignment such as `this.x = ...`
 * or `obj.value++`.
 */
function isMemberStateWrite(node: MaybeAstNode): boolean {
    const current = unwrapNode(node);
    if (!current) {
        return false;
    }

    if (current.type === 'AssignmentExpression') {
        const left = unwrapNode((current as AstNode & { left?: AstNode }).left);
        return !!left && isMemberExpressionLike(left);
    }

    if (current.type === 'UpdateExpression') {
        const argument = unwrapNode((current as AstNode & { argument?: AstNode }).argument);
        return !!argument && isMemberExpressionLike(argument);
    }

    if (current.type === 'UnaryExpression' && current.operator === 'delete') {
        const argument = unwrapNode((current as AstNode & { argument?: AstNode }).argument);
        return !!argument && isMemberExpressionLike(argument);
    }

    return false;
}

/**
 * Returns true when the node represents a write inside `computed(...)`.
 */
function isWriteNode(node: MaybeAstNode): boolean {
    const current = unwrapNode(node);
    if (!current) {
        return false;
    }

    if (isMemberStateWrite(current)) {
        return true;
    }

    if (current.type === 'CallExpression') {
        return isWriteMethodCall(current);
    }

    return false;
}

/**
 * Returns true when the node represents a side effect inside `computed(...)`.
 */
function isEffectNode(node: MaybeAstNode): boolean {
    const current = unwrapNode(node);
    if (!current) {
        return false;
    }

    return current.type === 'CallExpression' && isSideEffectMethodCall(current);
}

/**
 * Returns true when traversal should stop at the current node.
 */
function shouldStopTraversal(node: AstNode, root: AstNode): boolean {
    if (node === root) {
        return false;
    }

    return isFunctionBoundaryNode(node);
}

/**
 * Returns the first violation found in the subtree.
 *
 * Traversal stops at nested function boundaries to avoid reporting effects
 * inside helper functions that are declared, but not executed, by `computed(...)`.
 */
function findFirstViolation(root: AstNode): Violation | null {
    const stack: AstNode[] = [root];

    while (stack.length > 0) {
        const current = stack.pop()!;
        const node = unwrapNode(current);
        if (!node) {
            continue;
        }

        if (node !== root && isWriteNode(node)) {
            return { node, type: 'write' };
        }

        if (node !== root && isEffectNode(node)) {
            return { node, type: 'effect' };
        }

        if (shouldStopTraversal(node, root)) {
            continue;
        }

        for (const child of childNodes(node)) {
            stack.push(child);
        }
    }

    return null;
}

/**
 * Returns the violation message for the detected violation type.
 */
function getViolationMessage(type: ViolationType): string {
    if (type === 'write') {
        return 'Avoid writes or state mutations inside computed(). Computed signals must be pure to prevent reactive cycles.';
    }

    return 'Avoid side effects inside computed(). Computed signals must be pure.';
}

/**
 * Creates a rule failure from the detected violation.
 */
function createFailure(
    violation: Violation,
    call: AstNode,
    context: RuleContext,
): RuleFailure {
    const start = getNodeStart(violation.node) || getNodeStart(call);
    const { line, column } = context.locator.location(start);

    return {
        filePath: context.filePath,
        ruleName: RULE_NAME,
        message: getViolationMessage(violation.type),
        line,
        column,
        severity: 'error',
        fix: RECOMMENDATIONS[RULE_NAME],
    };
}

/**
 * Flags writes and side effects inside `computed(...)` callbacks.
 *
 * The rule intentionally avoids flagging local variable reassignment because
 * that requires scope analysis to distinguish harmless local computation from
 * external state mutation.
 */
export const signalNoSideEffectsInComputedRule = createCallExpressionRule(
    RULE_NAME,
    (node: CallExpression, context: RuleContext): RuleFailure | null => {
        const call = node as unknown as AstNode;

        if (!isCalleeNamed(call.callee, 'computed')) {
            return null;
        }

        const callback = getCallbackArg(call);
        if (!callback) {
            return null;
        }

        const body = getFunctionBody(callback);
        if (!body) {
            return null;
        }

        const violation = findFirstViolation(body);
        if (!violation) {
            return null;
        }

        return createFailure(violation, call, context);
    },
);