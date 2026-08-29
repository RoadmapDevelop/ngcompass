import { TemplateExpressionNode } from '@ngcompass/ast';
import { RuleFailure, RuleContext } from '@ngcompass/common';
import { createTemplateExpressionRule } from '@ngcompass/engine';
import { RECOMMENDATIONS } from '../../recommendations.js';
import {
  unwrapNode,
  getTemplateAbsoluteOffset,
} from '../../rule-utils.js';
import type { AstNode } from '../../models/index.js';

const RULE_NAME = 'template-no-async-pipe';

function hasAsyncPipe(nodeRaw: AstNode | null | undefined): boolean {
  const node = unwrapNode(nodeRaw);
  if (!node) {
    return false;
  }
  if (node.type === 'BinaryExpression' && node.operator === '|') {
    const right = unwrapNode(node.right);
    if (right?.type === 'Identifier' && right.name === 'async') {
      return true;
    }
    return hasAsyncPipe(node.left);
  }
  return false;
}

export const templateNoAsyncPipeRule = createTemplateExpressionRule(
  RULE_NAME,
  (node: TemplateExpressionNode, context: RuleContext): RuleFailure | null => {
    const hasAsync = hasAsyncPipe(node.expression as unknown as AstNode);
    if (!hasAsync) {
      return null;
    }

    const offset = getTemplateAbsoluteOffset(context, node.sourceSpan.start);
    const { line, column } = context.locator.location(offset);

    return {
      filePath: context.filePath,
      ruleName: RULE_NAME,
      message: 'Avoid using the async pipe in templates for zoneless applications; convert observables to signals using toSignal() in the component.',
      line,
      column,
      severity: 'error',
      fix: RECOMMENDATIONS[RULE_NAME],
    };
  },
  { requires: { htmlAst: true } }
);
