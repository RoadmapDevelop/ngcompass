import { createCallExpressionRule } from '../engine/rule-handler.js';
import type { CallExpression, MemberExpression, ArrowFunctionExpression, FunctionExpression, BlockStatement, IfStatement, Node } from '../ast/types.js';
import type { RuleContext, RuleFailure } from '../types.js';
import { RECOMMENDATIONS } from '../recommendations.js';

const WRITE_METHODS = new Set(['set', 'update', 'mutate']);

/**
 * signal-prefer-computed-over-sync-effect
 *
 * Detects effect() calls that manually update another signal.
 * In many cases, these should be computed() signals instead.
 *
 * Improvement: findSignalWrite now traverses IfStatement branches,
 * catching conditional signal writes that were previously missed.
 */
export const signalPreferComputedRule = createCallExpressionRule(
    'signal-prefer-computed-over-sync-effect',
    (node: CallExpression, context: RuleContext): RuleFailure | null => {
        const callee = node.callee;

        // Match effect()
        let isEffect = false;
        if (callee.type === 'Identifier') {
            isEffect = (callee as any).name === 'effect';
        } else if (callee.type === 'MemberExpression' || callee.type === 'StaticMemberExpression') {
            const member = callee as any;
            if (member.property && member.property.name === 'effect') {
                isEffect = true;
            }
        }

        if (!isEffect) return null;

        const callback = node.arguments[0];
        if (!callback) return null;

        let violation: Node | null = null;

        if (callback.type === 'ArrowFunctionExpression' || callback.type === 'FunctionExpression') {
            const functionNode = callback as ArrowFunctionExpression | FunctionExpression;
            violation = findSignalWrite(functionNode.body);
        }

        if (violation) {
            const start = violation.start ?? violation.span?.start ?? node.start ?? 0;
            const { line, column } = context.locator.location(start);

            return {
                filePath: context.filePath,
                ruleName: 'signal-prefer-computed-over-sync-effect',
                message: 'Prefer computed() over effect() for derived state. Manual signal writes in effects cause extra change detection cycles.',
                line,
                column,
                severity: 'moderate',
                fix: RECOMMENDATIONS['signal-prefer-computed-over-sync-effect'],
            };
        }

        return null;
    }
);

function findSignalWrite(node: Node): Node | null {
    if (!node) return null;

    if (node.type === 'BlockStatement') {
        for (const stmt of (node as BlockStatement).body) {
            const hit = findSignalWrite(stmt);
            if (hit) return hit;
        }
    }

    // Traverse IfStatement branches — previously missed conditional signal writes
    if (node.type === 'IfStatement') {
        const ifStmt = node as IfStatement;
        return findSignalWrite(ifStmt.consequent) ||
               (ifStmt.alternate ? findSignalWrite(ifStmt.alternate) : null);
    }

    if (node.type === 'CallExpression') {
        const call = node as CallExpression;
        if (call.callee.type === 'MemberExpression' || call.callee.type === 'StaticMemberExpression') {
            const member = call.callee as MemberExpression;
            if (member.property && WRITE_METHODS.has(member.property.name)) {
                return node;
            }
        }
    }

    if (node.type === 'ExpressionStatement') {
        return findSignalWrite((node as any).expression);
    }

    return null;
}
