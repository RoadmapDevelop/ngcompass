/**
 * template-no-negated-async
 *
 * Disallows negation of async pipe results in templates.
 *
 * Writing `!(obs$ | async)` is a common mistake — it evaluates as `true`
 * when the observable hasn't emitted yet (null/undefined state), producing
 * confusing "loading" → "loaded" → "empty" transitions.
 * Use explicit null checks or the `as` binding pattern instead.
 *
 * Tier P2 — Migration Support (Score: 14, Effort: 35hrs)
 */

import { createTemplateExpressionRule } from '../engine/rule-handler.js';
import type { TemplateExpressionNode } from '../engine/node-streams.js';
import type { RuleContext, RuleFailure } from '../types.js';
import { walkProgram } from '../visitor.js';
import { RECOMMENDATIONS } from '../recommendations.js';

/**
 * Returns true if expression is a pipe call ending in "async".
 */
function isAsyncPipeCall(node: any): boolean {
    // Template pipe expressions are represented as CallExpression-like nodes
    // where the callee.name === 'async' or the pipe chain ends in 'async'.
    if (!node) return false;

    // Angular template compiler represents pipes as CallExpression with identifier 'async'
    if (node.type === 'BindingPipe') {
        return node.name === 'async';
    }

    // Fallback: nested CallExpression pattern from some template parsers
    if (node.type === 'CallExpression') {
        const callee = node.callee;
        if (callee?.type === 'Identifier' && callee.name === 'async') return true;
    }

    return false;
}

export const templateNoNegatedAsyncRule = createTemplateExpressionRule(
    'template-no-negated-async',
    (node: TemplateExpressionNode, context: RuleContext): RuleFailure | null => {
        let failure: RuleFailure | null = null;

        walkProgram(node.expression, (child) => {
            if (failure) return false;

            // Look for UnaryExpression with operator '!'
            if (child.type !== 'UnaryExpression' && child.type !== 'PrefixNotExpression') return;
            const unary = child as any;
            if (unary.operator !== '!' && unary.op !== '!') return;

            const operand = unary.argument ?? unary.expression;
            if (!operand) return;

            // Check if the operand is (or contains) an async pipe
            let foundAsync = false;
            walkProgram(operand, (inner) => {
                if (isAsyncPipeCall(inner)) {
                    foundAsync = true;
                    return false;
                }
            });

            if (!foundAsync) return;

            const absoluteOffset = node.sourceSpan.start + (child.start ?? child.span?.start ?? 0);
            const { line, column } = context.locator.location(absoluteOffset);

            failure = {
                filePath: context.filePath,
                message: `Negating async pipe results is unreliable. Use (obs$ | async) === null.`,
                line,
                column,
                severity: 'moderate',
                ruleName: 'template-no-negated-async',
                fix: RECOMMENDATIONS['template-no-negated-async'],
            };
            return false;
        });

        return failure;
    },
    { requires: { htmlAst: true, tsAst: true } }
);
