import { createCallExpressionRule } from '../engine/rule-handler.js';
import type {
    CallExpression,
    MemberExpression,
    ArrowFunctionExpression,
    FunctionExpression,
    BlockStatement,
    IfStatement,
    UpdateExpression,
    ReturnStatement,
    Node
} from '../ast/types.js';
import type { RuleContext, RuleFailure } from '../types.js';
import { RECOMMENDATIONS } from '../recommendations.js';

const SIDE_EFFECT_METHODS = new Set([
    'get', 'post', 'put', 'delete', 'patch', // HTTP
    'subscribe', 'unsubscribe',              // RxJS
    'next', 'error', 'complete',             // Subjects
    'setItem', 'removeItem', 'clear',        // Storage
    'appendChild', 'removeChild',            // DOM
]);

const WRITE_METHODS = new Set(['set', 'update', 'mutate']);

/**
 * signal-no-side-effects-in-computed
 * 
 * Enforces purity inside computed() signals.
 * Rules covered: 
 * - Rule 12: General side effects (HTTP, RxJS, DOM)
 * - Rule 13: Signal writes (.set, .update) that cause reactive cycles.
 */
export const signalNoSideEffectsInComputedRule = createCallExpressionRule(
    'signal-no-side-effects-in-computed',
    (node: CallExpression, context: RuleContext): RuleFailure | null => {
        const callee = node.callee;

        // Match computed()
        let isComputed = false;
        if (callee.type === 'Identifier') {
            isComputed = (callee as any).name === 'computed';
        } else if (callee.type === 'MemberExpression' || callee.type === 'StaticMemberExpression') {
            const member = callee as any;
            if (member.property && member.property.name === 'computed') {
                isComputed = true;
            }
        }

        if (!isComputed) return null;

        const callback = node.arguments[0];
        if (!callback) return null;

        let violation: { node: Node, type: 'write' | 'effect' } | null = null;

        if (callback.type === 'ArrowFunctionExpression' || callback.type === 'FunctionExpression') {
            const functionNode = callback as ArrowFunctionExpression | FunctionExpression;
            violation = findViolation(functionNode.body);
        }

        if (violation) {
            const { node: vNode, type } = violation;
            const start = vNode.start ?? vNode.span?.start ?? node.start ?? 0;
            const { line, column } = context.locator.location(start);

            const isWrite = type === 'write';
            const ruleName = isWrite ? 'signal-no-writes-in-computed' : 'signal-no-side-effects-in-computed';
            const message = isWrite
                ? 'Avoid writing to signals inside computed signals. This causes reactive cycles.'
                : 'Avoid side effects inside computed signals. Computed must be pure.';

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

        return null;
    }
);

function findViolation(node: Node): { node: Node, type: 'write' | 'effect' } | null {
    if (!node) return null;

    // 1. Recursive Blocks
    if (node.type === 'BlockStatement') {
        for (const stmt of (node as BlockStatement).body) {
            const hit = findViolation(stmt);
            if (hit) return hit;
        }
    }

    if (node.type === 'IfStatement') {
        const ifStmt = node as IfStatement;
        return findViolation(ifStmt.consequent) || (ifStmt.alternate ? findViolation(ifStmt.alternate) : null);
    }

    // 2. Call Expressions (Methods)
    if (node.type === 'CallExpression') {
        const call = node as CallExpression;
        if (call.callee.type === 'MemberExpression' || call.callee.type === 'StaticMemberExpression') {
            const member = call.callee as MemberExpression;
            if (member.property) {
                if (WRITE_METHODS.has(member.property.name)) {
                    return { node, type: 'write' };
                }
                if (SIDE_EFFECT_METHODS.has(member.property.name)) {
                    return { node, type: 'effect' };
                }
            }
        }
    }

    // 3. Assignments & Updates (Writes)
    if (node.type === 'AssignmentExpression') {
        return { node, type: 'write' };
    }

    if (node.type === 'UpdateExpression') {
        return { node: node as UpdateExpression, type: 'write' };
    }

    // 4. Unwrap & Passthrough
    if (node.type === 'ExpressionStatement') {
        return findViolation((node as any).expression);
    }

    if (node.type === 'ReturnStatement') {
        return findViolation((node as ReturnStatement).argument as Node);
    }

    return null;
}
