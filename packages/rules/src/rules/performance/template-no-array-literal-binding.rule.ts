import { TemplateExpressionNode } from '@ngcompass/ast';
import { RuleContext, RuleFailure } from '@ngcompass/common';
import { createTemplateExpressionRule } from '@ngcompass/engine';
import { RECOMMENDATIONS } from '../../recommendations';
import {
  childNodes,
  unwrapNode,
  getTemplateAbsoluteOffset,
} from '../../rule-utils';
import type { AstNode, MaybeAstNode } from '../../models/index.js';

const RULE_NAME = 'template-no-array-literal-binding';

function hasArrayLiteral(root: MaybeAstNode): boolean {
  const stack: AstNode[] = root ? [root] : [];

  while (stack.length > 0) {
    const current = stack.pop()!;
    const node = unwrapNode(current);
    if (!node) continue;

    if (node.type === 'ArrayExpression') {
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
  context: RuleContext
): RuleFailure {
  const offset = getTemplateAbsoluteOffset(context, node.sourceSpan.start);
  const { line, column } = context.locator.location(offset);

  return {
    filePath: context.filePath,
    ruleName: RULE_NAME,
    message:
      'Array literals in template bindings create a new reference on every change detection cycle.',
    line,
    column,
    severity: 'warn',
    fix: RECOMMENDATIONS[RULE_NAME],
  };
}

export const templateNoArrayLiteralBindingRule = createTemplateExpressionRule(
  RULE_NAME,
  (
    node: TemplateExpressionNode,
    context: RuleContext
  ): RuleFailure[] | null => {
    const expression = node.expression as unknown as AstNode;

    if (!hasArrayLiteral(expression)) {
      return null;
    }

    return [createFailure(node, context)];
  },
  {
    requires: { htmlAst: true },
  }
);
