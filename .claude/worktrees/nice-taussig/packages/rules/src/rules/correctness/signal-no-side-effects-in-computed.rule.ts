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
    'post', 'put', 'patch', 'subscribe', 'unsubscribe', 'next', 'complete',
    'setItem', 'removeItem', 'appendChild', 'removeChild', 'dispatch',
]);

const WRITE_METHODS = new Set(['set', 'update', 'mutate']);
const FUNCTION_NODE_TYPES = new Set(['ArrowFunctionExpression', 'FunctionExpression', 'FunctionDeclaration']);

function isFunctionBoundaryNode(node: AstNode): boolean {
    return !!node.type && FUNCTION_NODE_TYPES.has(node.type);
}

function getCalledMemberName(node: MaybeAstNode): string {
    const call = unwrapNode(node);
    if (!call || call.type !== 'CallExpression') return '';

    const callee = unwrapNode(call.callee);
    return isMemberExpressionLike(callee) ? (getStaticPropertyName(callee) || '') : '';
}

function isMemberStateWrite(node: MaybeAstNode): boolean {
    const current = unwrapNode(node);
    if (!current) return false;

    if (current.type === 'AssignmentExpression') {
        const left = unwrapNode((current as any).left);
        return !!left && isMemberExpressionLike(left);
    }
    if (current.type === 'UpdateExpression') {
        const argument = unwrapNode((current as any).argument);
        return !!argument && isMemberExpressionLike(argument);
    }
    if (current.type === 'UnaryExpression' && current.operator === 'delete') {
        const argument = unwrapNode((current as any).argument);
        return !!argument && isMemberExpressionLike(argument);
    }
    return false;
}

function findFirstViolation(root: AstNode): { node: AstNode; type: 'write' | 'effect' } | null {
    const stack: AstNode[] = [root];

    while (stack.length > 0) {
        const node = unwrapNode(stack.pop()!);
        if (!node) continue;

        if (node !== root) {
            if (isMemberStateWrite(node)) return { node, type: 'write' };
            if (node.type === 'CallExpression') {
                const methodName = getCalledMemberName(node);
                if (WRITE_METHODS.has(methodName)) return { node, type: 'write' };
                if (SIDE_EFFECT_METHODS.has(methodName)) return { node, type: 'effect' };
            }
        }

        if (node !== root && isFunctionBoundaryNode(node)) continue;

        for (const child of childNodes(node)) {
            stack.push(child);
        }
    }
    return null;
}

function createFailure(violationNode: AstNode, call: AstNode, context: RuleContext, type: 'write' | 'effect'): RuleFailure {
    const start = getNodeStart(violationNode) || getNodeStart(call);
    const { line, column } = context.locator.location(start);

    return {
        filePath: context.filePath,
        ruleName: RULE_NAME,
        message: type === 'write'
            ? 'Avoid writes or state mutations inside computed(). Computed signals must be pure to prevent reactive cycles.'
            : 'Avoid side effects inside computed(). Computed signals must be pure.',
        line,
        column,
        severity: 'error',
        fix: RECOMMENDATIONS[RULE_NAME],
    };
}

export const signalNoSideEffectsInComputedRule = createCallExpressionRule(
    RULE_NAME,
    (node: CallExpression, context: RuleContext): RuleFailure | null => {
        const call = node as unknown as AstNode;

        if (!isCalleeNamed(call.callee, 'computed')) return null;

        const callback = getCallbackArg(call);
        const body = callback ? getFunctionBody(callback) : null;
        if (!body) return null;

        const violation = findFirstViolation(body);
        if (!violation) return null;

        return createFailure(violation.node, call, context, violation.type);
    },
);