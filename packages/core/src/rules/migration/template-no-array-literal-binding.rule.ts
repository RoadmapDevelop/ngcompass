import { createTemplateExpressionRule } from '../engine/rule-handler.js';
import type { TemplateExpressionNode } from '../engine/node-streams.js';
import type { RuleContext, RuleFailure } from '../types.js';
import { RECOMMENDATIONS } from '../recommendations.js';

/**
 * template-no-array-literal-binding
 * 
 * Array literals in template bindings create new instances on every change detection cycle.
 * This triggers downstream change detection and can cause major performance issues.
 */
export const templateNoArrayLiteralBindingRule = createTemplateExpressionRule(
    'template-no-array-literal-binding',
    (node: TemplateExpressionNode, context: RuleContext): RuleFailure | null => {
        if (node.expression.type === 'ArrayExpression') {
            const templateOffset = context.template?.templateStartOffset ?? 0;
            const { line, column } = context.locator.location(node.sourceSpan.start + templateOffset);

            return {
                filePath: context.filePath,
                ruleName: 'template-no-array-literal-binding',
                message: 'Avoid array literals in template bindings.',
                line,
                column,
                severity: 'moderate',
                fix: RECOMMENDATIONS['template-no-array-literal-binding'],
            };
        }

        return null;
    },
    {
        requires: { htmlAst: true }
    }
);
