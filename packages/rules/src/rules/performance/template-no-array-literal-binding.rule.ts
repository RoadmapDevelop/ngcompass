import { TemplateExpressionNode } from "@ngcompass/ast";
import { RuleFailure } from "@ngcompass/common";
import { createTemplateExpressionRule } from '@ngcompass/engine';
import { RECOMMENDATIONS } from "../../recommendations";
import { AstNode, MaybeAstNode, unwrapNode, childNodes } from "../../rule-utils";
import { RuleContext } from "@ngcompass/common";

function getTemplateAbsoluteOffset(context: RuleContext, node: TemplateExpressionNode): number {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const templateStartOffset = (context as any).template?.templateStartOffset;
    if (typeof templateStartOffset === 'number' && Number.isFinite(templateStartOffset)) {
        return node.sourceSpan.start + templateStartOffset;
    }
    return node.sourceSpan.start;
}

/**
 * Finds all ArrayExpressions anywhere in the expression tree (nested detection).
 */
function findAllArrayLiterals(root: MaybeAstNode): AstNode[] {
    const hits: AstNode[] = [];
    const stack: AstNode[] = root ? [root] : [];

    while (stack.length) {
        const node = stack.pop()!;
        const n = unwrapNode(node);
        if (!n) continue;

        if (n.type === 'ArrayExpression') {
            hits.push(n);
        }

        for (const child of childNodes(n)) {
            stack.push(child);
        }
    }
    return hits;
}

/**
 * Disallows array literals in Angular template bindings (including nested).
 */
export const templateNoArrayLiteralBindingRule = createTemplateExpressionRule(
    'template-no-array-literal-binding',
    (node: TemplateExpressionNode, context: RuleContext): RuleFailure[] | null => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const hits = findAllArrayLiterals((node as any).expression);
        if (hits.length === 0) return null;

        return hits.map(() => {
            const offset = getTemplateAbsoluteOffset(context, node);
            const { line, column } = context.locator.location(offset);

            return {
                filePath: context.filePath,
                ruleName: 'template-no-array-literal-binding',
                message: 'Avoid array literals in template bindings. Move the array to a component field, a signal/computed value, or a pure pipe.',
                line,
                column,
                severity: 'warn',
                fix: RECOMMENDATIONS['template-no-array-literal-binding'],
            };
        });
    },
    {
        requires: { htmlAst: true },
    }
);

