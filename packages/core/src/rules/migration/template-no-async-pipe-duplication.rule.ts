import { createTemplateExpressionRule } from '../engine/rule-handler.js';
import type { TemplateExpressionNode } from '../engine/node-streams.js';
import type { RuleContext, RuleFailure, RuleSeverity } from '../types.js';
import { RECOMMENDATIONS } from '../recommendations.js';
import type { Node, Identifier } from '../ast/types.js';

// Per-file state storage
const seenObservablesMap = new WeakMap<RuleContext, Set<string>>();

/**
 * template-no-async-pipe-duplication
 * 
 * Detects multiple | async subscriptions to the same observable in a template.
 * This can cause multiple HTTP requests or redundant computations.
 */
export const templateNoAsyncPipeDuplicationRule = createTemplateExpressionRule(
    'template-no-async-pipe-duplication',
    (node: TemplateExpressionNode, context: RuleContext): RuleFailure | null => {
        const expression = node.expression;

        // Find the observable being piped to 'async'
        const asyncObservable = findAsyncPipedExpression(expression);
        if (!asyncObservable) return null;

        const observableKey = stringifyExpression(asyncObservable);
        if (!observableKey) return null;

        // Initialize or get the set of seen observables for this file context
        let seen = seenObservablesMap.get(context);
        if (!seen) {
            seen = new Set();
            seenObservablesMap.set(context, seen);
        }

        if (seen.has(observableKey)) {
            const { line, column } = context.locator.location(node.sourceSpan.start);

            return {
                filePath: context.filePath,
                ruleName: 'template-no-async-pipe-duplication',
                message: `Duplicate async pipe subscription for "${observableKey}". Use @if (obs$ | async; as value) to share the subscription.`,
                line,
                column,
                severity: 'moderate' as RuleSeverity,
                fix: RECOMMENDATIONS['template-no-async-pipe-duplication'],
            };
        }

        seen.add(observableKey);
        return null;
    },
    {
        requires: { htmlAst: true }
    }
);

/**
 * Recursively find the expression being piped to 'async'.
 * e.g., in (a | pipe1 | async) it should return (a | pipe1).
 */
function findAsyncPipedExpression(node: Node): Node | null {
    if (node.type === 'BinaryExpression') {
        const binary = node as any;
        if (binary.operator === '|') {
            const right = binary.right;
            if (right.type === 'Identifier' && (right as Identifier).name === 'async') {
                return binary.left;
            }
            // If it's a chain of pipes, continue searching in the left part
            return findAsyncPipedExpression(binary.left);
        }
    }
    return null;
}

/**
 * Minimal expression stringifier for identifiers and member expressions.
 */
function stringifyExpression(node: Node): string | null {
    if (node.type === 'Identifier') {
        return (node as Identifier).name;
    }
    if (node.type === 'StaticMemberExpression' || node.type === 'MemberExpression') {
        const member = node as any;
        const obj = stringifyExpression(member.object);
        const prop = (member.property as any).name;
        if (obj && prop) return `${obj}.${prop}`;
    }
    // For complex expressions, we might just return the source if we had it,
    // but we want to avoid multiple calls to getSourceText.
    // For now, these common cases cover 90% of usage.
    return null;
}
