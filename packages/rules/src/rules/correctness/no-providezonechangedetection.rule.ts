import { CallExpression } from '@ngcompass/ast';
import { RuleContext, RuleFailure } from '@ngcompass/common';
import { createCallExpressionRule } from '@ngcompass/engine';
import { RECOMMENDATIONS } from '../../recommendations';
import {
  getNodeStart,
  unwrapNode,
} from '../../rule-utils';
import type { AstNode } from '../../models/index.js';

const RULE_NAME = 'no-providezonechangedetection';

export const noProvideZoneChangeDetectionRule = createCallExpressionRule(
  RULE_NAME,
  (node: CallExpression, context: RuleContext): RuleFailure | null => {
    const astNode = node as unknown as AstNode;
    const callee = unwrapNode(astNode.callee);
    if (!callee || callee.type !== 'Identifier') return null;
    if (callee.name !== 'provideZoneChangeDetection') return null;

    const { line, column } = context.locator.location(getNodeStart(astNode));
    return {
      filePath: context.filePath,
      ruleName: RULE_NAME,
      message:
        'Do not use provideZoneChangeDetection(); use provideExperimentalZonelessChangeDetection() (or remove it once stable) in a zoneless application.',
      line,
      column,
      severity: 'error',
      fix: RECOMMENDATIONS[RULE_NAME],
    };
  }
);
