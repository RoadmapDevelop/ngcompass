import { createTemplateExpressionRule } from "../engine";
import { TemplateExpressionNode } from "../engine/node-streams";
import { RECOMMENDATIONS } from "../recommendations";
import { RuleContext, RuleFailure } from "../types";

export const templateNoCallExpressionRule = createTemplateExpressionRule(
    'template-no-call-expression',
    (node: TemplateExpressionNode, context: RuleContext): RuleFailure | null => {
        const { expression, sourceSpan } = node;

        // 1. Identify if it is a call, optional call, or part of a chain
        const isCall = expression.type === 'CallExpression' ||
            (expression.type as string) === 'ChainExpression' ||
            (expression.type as string) === 'OptionalCallExpression';

        if (isCall) {
            // 2. Extract arguments based on the expression type
            // Signals always have 0 arguments: mySignal()
            // Standard performance-heavy functions often have 1 or more: transformData(item)
            const callExpr = expression.type === 'CallExpression'
                ? expression
                : (expression as any).expression; // For Optional/Chain

            const args = callExpr?.arguments ?? [];

            // 3. ALLOW 0-argument calls (Assuming they are Signals or simple getters)
            // Only flag if there are arguments, which implies logic/computation
            if (args.length === 0) {
                return null;
            }

            const templateOffset = context.template?.templateStartOffset ?? 0;
            const { line, column } = context.locator.location(sourceSpan.start + templateOffset);

            return {
                filePath: context.filePath,
                ruleName: 'template-no-call-expression',
                message: 'Avoid passing arguments to functions in templates. Use Signals or Pipes instead.',
                line,
                column,
                severity: 'high',
                fix: RECOMMENDATIONS['template-no-call-expression'],
            };
        }

        return null;
    },
    {
        requires: { htmlAst: true }
    }
);