import { createTemplateExpressionRule } from '../engine/rule-handler.js';
import type { TemplateExpressionNode } from '../engine/node-streams.js';
import type { RuleContext, RuleFailure } from '../types.js';
import { RECOMMENDATIONS } from '../recommendations.js';

/**
 * template-no-object-literal-binding
 * 
 * Object literals in template bindings create new instances on every change detection cycle.
 * This triggers downstream change detection and can cause major performance issues.
 */
export const templateNoObjectLiteralBindingRule = createTemplateExpressionRule(
    'template-no-object-literal-binding',
    (node: TemplateExpressionNode, context: RuleContext): RuleFailure | null => {
        if (node.expression.type === 'ObjectExpression') {
            const templateOffset = context.template?.templateStartOffset ?? 0;
            const { line, column } = context.locator.location(node.sourceSpan.start + templateOffset);

            return {
                filePath: context.filePath,
                ruleName: 'template-no-object-literal-binding',
                message: 'Avoid object literals in template bindings.',
                line,
                column,
                severity: 'moderate',
                fix: RECOMMENDATIONS['template-no-object-literal-binding'],
            };
        }

        return null;
    },
    {
        requires: { htmlAst: true }
    }
);
