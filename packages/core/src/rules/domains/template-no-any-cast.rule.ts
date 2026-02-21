/**
 * template-no-any-cast
 *
 * Disallows the use of Angular's $any() type cast function in templates.
 *
 * $any(expr) tells the Angular template compiler to treat the expression as
 * type `any`, silently suppressing type errors. This is a type-safety escape
 * hatch that hides real bugs. The correct fix is to properly type the
 * expression so the type checker understands it without a cast.
 *
 * Priority 3 — Template Coverage
 */

import { createTemplateExpressionRule } from '../engine/rule-handler.js';
import type { TemplateExpressionNode } from '../engine/node-streams.js';
import type { RuleContext, RuleFailure } from '../types.js';
import { walkProgram } from '../visitor.js';
import { RECOMMENDATIONS } from '../recommendations.js';

export const templateNoAnyCastRule = createTemplateExpressionRule(
    'template-no-any-cast',
    (node: TemplateExpressionNode, context: RuleContext): RuleFailure | null => {
        let failure: RuleFailure | null = null;

        walkProgram(node.expression, (child) => {
            if (failure) return false;

            if (child.type !== 'CallExpression') return;

            const callee = child.callee;
            if (!callee || callee.type !== 'Identifier') return;
            if (callee.name !== '$any') return;

            const absoluteOffset = node.sourceSpan.start + (child.start ?? 0);
            const { line, column } = context.locator.location(absoluteOffset);

            failure = {
                filePath: context.filePath,
                message: `Avoid $any() type cast — it suppresses type checking. Fix the underlying type instead.`,
                line,
                column,
                severity: 'high',
                ruleName: 'template-no-any-cast',
                fix: RECOMMENDATIONS['template-no-any-cast'],
            };

            return false;
        });

        return failure;
    },
    { requires: { htmlAst: true, tsAst: true } }
);
