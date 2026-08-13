import { CallExpression } from '@ngcompass/ast';
import { RuleContext, RuleFailure } from '@ngcompass/common';
import { createCallExpressionRule } from '@ngcompass/engine';
import { RECOMMENDATIONS } from '../../recommendations';
import {
  getNodeStart,
  unwrapNode,
} from '../../rule-utils';
import type { AstNode } from '../../models/index.js';

const RULE_NAME = 'no-zonejs-testing-functions';

const ZONE_TESTING_FUNCTIONS = new Set([
  'fakeAsync',
  'discardPeriodicTasks',
  'flush',
  'flushMicrotasks',
  'resetFakeAsyncZone',
  'tick',
  'waitForAsync',
]);

export const noZoneJsTestingFunctionsRule = createCallExpressionRule(
  RULE_NAME,
  (node: CallExpression, context: RuleContext): RuleFailure | null => {
    const astNode = node as unknown as AstNode;
    const callee = unwrapNode(astNode.callee);
    if (!callee || callee.type !== 'Identifier') return null;

    const name = callee.name as string;
    if (!ZONE_TESTING_FUNCTIONS.has(name)) return null;

    const { line, column } = context.locator.location(getNodeStart(astNode));
    return {
      filePath: context.filePath,
      ruleName: RULE_NAME,
      message: `Avoid ${name}(); zone.js testing helpers are useless and do not work in a zoneless application.`,
      line,
      column,
      severity: 'error',
      fix: RECOMMENDATIONS[RULE_NAME],
    };
  }
);
