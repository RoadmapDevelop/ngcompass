import { RuleFailure } from "@ngcompass/common";
import { CallExpression } from "@ngcompass/ast";
import { createCallExpressionRule } from '@ngcompass/engine';
import { RECOMMENDATIONS } from "../../recommendations";
import { AstNode, unwrapNode, isMemberExpressionLike, getStaticPropertyName, childNodes, isCalleeNamed, getCallbackArg, getFunctionBody, getNodeStart } from "../../rule-utils";
import { RuleContext } from "@ngcompass/common";


const SIDE_EFFECT_METHODS = new Set([
    'post', 'put', 'patch', 'subscribe', 'unsubscribe',
    'next', 'error', 'complete', 'setItem', 'removeItem',
    'clear', 'appendChild', 'removeChild', 'dispatch',
    'log', 'warn', 'info', 'debug', 'trace',
]);

const WRITE_METHODS = new Set(['set', 'update', 'mutate']);

function isWriteCall(callExpr: AstNode | null | undefined): boolean {
    const call = unwrapNode(callExpr);
    if (!call || call.type !== 'CallExpression') return false;
    const callee = unwrapNode(call.callee);
    if (!isMemberExpressionLike(callee)) return false;
    return WRITE_METHODS.has(getStaticPropertyName(callee));
}

function isSideEffectCall(callExpr: AstNode | null | undefined): boolean {
    const call = unwrapNode(callExpr);
    if (!call || call.type !== 'CallExpression') return false;
    const callee = unwrapNode(call.callee);
    if (!isMemberExpressionLike(callee)) return false;
    return SIDE_EFFECT_METHODS.has(getStaticPropertyName(callee));
}

function isWriteNode(node: AstNode | null | undefined): boolean {
    const n = unwrapNode(node);
    if (!n) return false;
    if (n.type === 'AssignmentExpression') return true;
    if (n.type === 'UpdateExpression') return true;
    if (n.type === 'UnaryExpression' && n.operator === 'delete') return true;
    if (n.type === 'CallExpression') return isWriteCall(n);
    return false;
}

function isEffectNode(node: AstNode | null | undefined): boolean {
    const n = unwrapNode(node);
    if (!n) return false;
    if (n.type === 'CallExpression') return isSideEffectCall(n);
    return false;
}

type Violation = { node: AstNode; type: 'write' | 'effect' };

function findViolations(root: AstNode): Violation[] {
    const violations: Violation[] = [];
    const stack: AstNode[] = [root];

    while (stack.length) {
        const node = stack.pop()!;
        const n = unwrapNode(node);
        if (!n) continue;

        if (isWriteNode(n)) {
            violations.push({ node: n, type: 'write' });
        } else if (isEffectNode(n)) {
            violations.push({ node: n, type: 'effect' });
        }

        for (const child of childNodes(n)) {
            stack.push(child);
        }
    }

    return violations;
}

/**
 * Enforces purity inside `computed(...)` signal callbacks.
 * Detects writes, mutations, and side-effect calls.
 */
export const signalNoSideEffectsInComputedRule = createCallExpressionRule(
    'signal-no-side-effects-in-computed',
    (node: CallExpression, context: RuleContext): RuleFailure | null => {
        const call = node as any as AstNode;

        if (!isCalleeNamed(call.callee, 'computed')) return null;

        const callback = getCallbackArg(call);
        if (!callback) return null;

        const body = getFunctionBody(callback);
        if (!body) return null;

        const violations = findViolations(body);
        if (!violations.length) return null;

        const first = violations[0];
        const start = getNodeStart(first.node) || getNodeStart(call);
        const { line, column } = context.locator.location(start);

        const ruleName = first.type === 'write' ? 'signal-no-writes-in-computed' : 'signal-no-side-effects-in-computed';
        const message =
            first.type === 'write'
                ? 'Avoid writes or mutations inside computed(). Computed signals must be pure to prevent reactive cycles.'
                : 'Avoid side effects inside computed(). Computed signals must be pure.';

        return {
            filePath: context.filePath,
            ruleName,
            message,
            line,
            column,
            severity: 'error',
            fix: RECOMMENDATIONS[ruleName],
        };
    }
);

