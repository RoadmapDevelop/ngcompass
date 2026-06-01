import { AnyAngularClassNode } from '@ngcompass/ast';
import { RuleContext, RuleFailure } from '@ngcompass/common';
import { createAnyAngularClassRule } from '@ngcompass/engine';
import { RECOMMENDATIONS } from '../../recommendations';
import {
  AstNode,
  getClassBody,
  getNodeStart,
  unwrapNode,
} from '../../rule-utils';

const RULE_NAME = 'no-view-decorator';
const VIEW_DECORATORS = new Set(['ViewChild', 'ViewChildren']);

function getDecoratorIdentifierName(node: AstNode): string {
  const expr = unwrapNode(node.expression ?? node);
  if (!expr) return '';
  if (expr.type === 'Identifier') return (expr.name as string) ?? '';
  if (expr.type === 'CallExpression') {
    const callee = unwrapNode(expr.callee);
    if (callee?.type === 'Identifier') return (callee.name as string) ?? '';
  }
  return '';
}

export const noViewDecoratorRule = createAnyAngularClassRule(
  RULE_NAME,
  (
    classNodeWrapper: AnyAngularClassNode,
    context: RuleContext
  ): RuleFailure[] | null => {
    if (
      classNodeWrapper.decoratorName !== 'Component' &&
      classNodeWrapper.decoratorName !== 'Directive'
    ) {
      return null;
    }

    const classBody = getClassBody(classNodeWrapper.node as AstNode);
    const failures: RuleFailure[] = [];

    for (const member of classBody) {
      const m = unwrapNode(member);
      if (
        !m ||
        (m.type !== 'PropertyDefinition' && m.type !== 'AccessorProperty') ||
        !Array.isArray(m.decorators)
      ) {
        continue;
      }

      let matched: string | undefined;
      for (const dec of m.decorators) {
        const name = getDecoratorIdentifierName(dec);
        if (VIEW_DECORATORS.has(name)) {
          matched = name;
          break;
        }
      }
      if (!matched) continue;

      const { line, column } = context.locator.location(getNodeStart(m));
      failures.push({
        filePath: context.filePath,
        ruleName: RULE_NAME,
        message: `Avoid @${matched}(); use the ${matched === 'ViewChild' ? 'viewChild' : 'viewChildren'}() signal version instead.`,
        line,
        column,
        severity: 'error',
        fix: RECOMMENDATIONS[RULE_NAME],
      });
    }

    return failures.length > 0 ? failures : null;
  }
);
