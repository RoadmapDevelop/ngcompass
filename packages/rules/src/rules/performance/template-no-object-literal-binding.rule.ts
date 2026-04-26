import { TemplateExpressionNode } from '@ngcompass/ast';
import { RuleContext, RuleFailure } from '@ngcompass/common';
import { createTemplateExpressionRule } from '@ngcompass/engine';
import { RECOMMENDATIONS } from '../../recommendations';
import { AstNode, MaybeAstNode, childNodes, unwrapNode, getTemplateAbsoluteOffset } from '../../rule-utils';

const RULE_NAME = 'template-no-object-literal-binding';

function hasObjectLiteral(root: MaybeAstNode): boolean {
    const stack: AstNode[] = root ? [root] : [];

    while (stack.length > 0) {
        const current = stack.pop()!;
        const node = unwrapNode(current);
        if (!node) continue;

        if (node.type === 'ObjectExpression') {
            return true;
        }

        for (const child of childNodes(node)) {
            stack.push(child);
        }
    }

    return false;
}

function createFailure(
    node: TemplateExpressionNode,
    context: RuleContext,
): RuleFailure {
    const offset = getTemplateAbsoluteOffset(context, node.sourceSpan.start);
    const { line, column } = context.locator.location(offset);

    return {
        filePath: context.filePath,
        ruleName: RULE_NAME,
        message: 'Avoid object literals in template bindings. Move the object to a component field, a signal/computed value, or a pure pipe.',
        line,
        column,
        severity: 'warn',
        fix: RECOMMENDATIONS[RULE_NAME],
    };
}

export const templateNoObjectLiteralBindingRule = createTemplateExpressionRule(
    RULE_NAME,
    (node: TemplateExpressionNode, context: RuleContext): RuleFailure[] | null => {
        const expression = node.expression as unknown as AstNode;

        if (!hasObjectLiteral(expression)) {
            return null;
        }

        return [createFailure(node, context)];
    },
    {
        requires: { htmlAst: true },
    },
);