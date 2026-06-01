import { CallExpression } from '@ngcompass/ast';
import { RuleContext, RuleFailure } from '@ngcompass/common';
import { createCallExpressionRule } from '@ngcompass/engine';
import { RECOMMENDATIONS } from '../../recommendations';
import {
  AstNode,
  getNodeStart,
  getStaticPropertyName,
  isMemberExpressionLike,
  unwrapNode,
} from '../../rule-utils';

const RULE_NAME = 'no-detectchanges-testing';

function isSpecFile(filePath: string): boolean {
  return /\.(spec|test)\.(ts|tsx)$/i.test(filePath);
}

export const noDetectChangesTestingRule = createCallExpressionRule(
  RULE_NAME,
  (node: CallExpression, context: RuleContext): RuleFailure | null => {
    if (!isSpecFile(context.filePath)) return null;

    const astNode = node as unknown as AstNode;
    const callee = unwrapNode(astNode.callee);
    if (!isMemberExpressionLike(callee)) return null;
    if (getStaticPropertyName(callee) !== 'detectChanges') return null;

    const { line, column } = context.locator.location(getNodeStart(astNode));
    return {
      filePath: context.filePath,
      ruleName: RULE_NAME,
      message:
        'Avoid fixture.detectChanges() in tests; use await fixture.whenStable() in a zoneless application.',
      line,
      column,
      severity: 'error',
      fix: RECOMMENDATIONS[RULE_NAME],
    };
  }
);
