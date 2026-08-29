import { CallExpression } from '@ngcompass/ast';
import { RuleContext, RuleFailure } from '@ngcompass/common';
import { createCallExpressionRule } from '@ngcompass/engine';
import { RECOMMENDATIONS } from '../../recommendations';
import {
  getNodeStart,
  unwrapNode,
} from '../../rule-utils';
import type { AstNode } from '../../models/index.js';

const RULE_NAME = 'no-changedetectorref';

export const noChangeDetectorRefRule = createCallExpressionRule(
  RULE_NAME,
  (node: CallExpression, context: RuleContext): RuleFailure | null => {
    const astNode = node as unknown as AstNode;
    const callee = unwrapNode(astNode.callee);
    if (!callee || callee.type !== 'Identifier' || callee.name !== 'inject') {
      return null;
    }

    const args = Array.isArray(astNode.arguments) ? astNode.arguments : [];
    const firstArg = unwrapNode(args[0]);
    if (!firstArg || firstArg.type !== 'Identifier') return null;
    if (firstArg.name !== 'ChangeDetectorRef') return null;

    const { line, column } = context.locator.location(getNodeStart(astNode));
    return {
      filePath: context.filePath,
      ruleName: RULE_NAME,
      message:
        'Do not inject ChangeDetectorRef; with signals, manual change detection is rarely needed in a zoneless application.',
      line,
      column,
      severity: 'error',
      fix: RECOMMENDATIONS[RULE_NAME],
    };
  }
);
