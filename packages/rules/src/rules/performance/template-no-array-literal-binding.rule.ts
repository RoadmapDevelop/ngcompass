import { TemplateExpressionNode } from '@ngcompass/ast';
import { RuleContext, RuleFailure } from '@ngcompass/common';
import { createTemplateExpressionRule } from '@ngcompass/engine';

import { RECOMMENDATIONS } from '../../recommendations';
import { AstNode, MaybeAstNode, childNodes, unwrapNode } from '../../rule-utils';

const RULE_NAME = 'template-no-array-literal-binding';

/**
 * Returns the absolute source offset for the template expression.
 */
function getTemplateAbsoluteOffset(
    context: RuleContext,
    node: TemplateExpressionNode,
): number {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const templateStartOffset = (context as any).template?.templateStartOffset;

    if (typeof templateStartOffset === 'number' && Number.isFinite(templateStartOffset)) {
        return node.sourceSpan.start + templateStartOffset;
    }

    return node.sourceSpan.start;
}

/**
 * Returns true when the expression subtree contains an array literal.
 */
function hasArrayLiteral(root: MaybeAstNode): boolean {
    const stack: AstNode[] = root ? [root] : [];

    while (stack.length > 0) {
        const current = stack.pop()!;
        const node = unwrapNode(current);
        if (!node) {
            continue;
        }

        if (node.type === 'ArrayExpression') {
            return true;
        }

        for (const child of childNodes(node)) {
            stack.push(child);
        }
    }

    return false;
}

/**
 * Builds the failure message for array literals in template bindings.
 */
function buildFailureMessage(): string {
    return 'Avoid array literals in template bindings. Move the array to a component field, a signal/computed value, or a pure pipe.';
}

/**
 * Creates a rule failure for an array literal found in a template binding.
 *
 * Note:
 * This rule reports at the template expression start rather than attempting to
 * map nested expression-node offsets, which may come from a different source
 * offset model than Angular template spans.
 */
function createFailure(
    node: TemplateExpressionNode,
    context: RuleContext,
): RuleFailure {
    const offset = getTemplateAbsoluteOffset(context, node);
    const { line, column } = context.locator.location(offset);

    return {
        filePath: context.filePath,
        ruleName: RULE_NAME,
        message: buildFailureMessage(),
        line,
        column,
        severity: 'warn',
        fix: RECOMMENDATIONS[RULE_NAME],
    };
}

/**
 * Disallows array literals in Angular template bindings.
 */
export const templateNoArrayLiteralBindingRule = createTemplateExpressionRule(
    RULE_NAME,
    (node: TemplateExpressionNode, context: RuleContext): RuleFailure[] | null => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const expression = (node as any).expression;

        if (!hasArrayLiteral(expression)) {
            return null;
        }

        return [createFailure(node, context)];
    },
    {
        requires: { htmlAst: true },
    },
);