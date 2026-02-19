
import { createTemplateExpressionRule } from '../engine/rule-handler.js';
import type { TemplateExpressionNode } from '../engine/node-streams.js';
import type { RuleContext, RuleFailure } from '../types.js';
import { walkProgram } from '../visitor.js';
import { RECOMMENDATIONS } from '../recommendations.js';

/**
 * template-no-call-expression
 *
 * Detects function calls in templates (e.g. {{ getValue() }}).
 * Function calls in templates are executed on every change detection cycle,
 * which can lead to performance issues.
 */
export const templateNoCallExpressionRule = createTemplateExpressionRule(
    'template-no-call-expression',
    (node: TemplateExpressionNode, context: RuleContext): RuleFailure | null => {
        let failure: RuleFailure | null = null;

        walkProgram(node.expression, (child) => {
            if (failure) return false;

            if (child.type === 'CallExpression') {
                // Calculate absolute position
                // node.sourceSpan.start: offset of expression in file
                // child.start: offset of call within expression
                const absoluteOffset = node.sourceSpan.start + (child.start || 0);

                const { line, column } = context.locator.location(absoluteOffset);

                failure = {
                    filePath: context.filePath,
                    message: 'Avoid function calls in templates. Use signals or pure pipes.',
                    line,
                    column,
                    severity: 'moderate', // Configurable, default to moderate/high
                    ruleName: 'template-no-call-expression',
                    fix: RECOMMENDATIONS['template-no-call-expression'],
                };
                return false;
            }
        });

        return failure;
    },
    {
        requires: {
            htmlAst: true,
            tsAst: true,
        }
    }
);
