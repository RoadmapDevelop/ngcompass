import { AnyAngularClassNode } from '@ngcompass/ast';
import { RuleContext, RuleFailure } from '@ngcompass/common';
import { createAnyAngularClassRule } from '@ngcompass/engine';
import { RECOMMENDATIONS } from '../../recommendations';
import {
  AstNode,
  getClassBody,
  getMethodName,
  getNodeStart,
  isMethodDefinition,
  unwrapNode,
} from '../../rule-utils';

const RULE_NAME = 'no-directive-accessor';

function isPrivateMember(member: AstNode): boolean {
  if (member.accessibility === 'private') return true;
  const key = unwrapNode(member.key);
  if (key?.type === 'PrivateIdentifier') return true;
  if (key?.type === 'PrivateName') return true;
  return false;
}

export const noDirectiveAccessorRule = createAnyAngularClassRule(
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
      if (!isMethodDefinition(member)) continue;
      if (member.kind !== 'get' && member.kind !== 'set') continue;
      if (isPrivateMember(member)) continue;

      const name = getMethodName(member);
      const { line, column } = context.locator.location(getNodeStart(member));
      failures.push({
        filePath: context.filePath,
        ruleName: RULE_NAME,
        message: `'${name}' is a non-private ${member.kind === 'get' ? 'getter' : 'setter'}; use computed() for UI-bound values, or mark it private otherwise.`,
        line,
        column,
        severity: 'error',
        fix: RECOMMENDATIONS[RULE_NAME],
      });
    }

    return failures.length > 0 ? failures : null;
  }
);
