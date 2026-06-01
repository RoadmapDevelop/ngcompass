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

const RULE_NAME = 'no-directive-writable-property';

function isPrivateMember(member: AstNode): boolean {
  if (member.accessibility === 'private') return true;
  const key = unwrapNode(member.key);
  if (key?.type === 'PrivateIdentifier') return true;
  if (key?.type === 'PrivateName') return true;
  return false;
}

function getPropertyName(member: AstNode): string {
  const key = unwrapNode(member.key);
  if (!key) return '(unknown)';
  if (key.type === 'Identifier') return (key.name as string) ?? '(unknown)';
  if (key.type === 'Literal' && typeof key.value === 'string') return key.value;
  if (key.type === 'PrivateIdentifier' || key.type === 'PrivateName') {
    return `#${(key.name as string) ?? ''}`;
  }
  return '(unknown)';
}

export const noDirectiveWritablePropertyRule = createAnyAngularClassRule(
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
      if (!m) continue;
      if (m.type !== 'PropertyDefinition' && m.type !== 'AccessorProperty') {
        continue;
      }
      if (m.static) continue;
      if (m.readonly) continue;
      if (isPrivateMember(m)) continue;

      const name = getPropertyName(m);
      const { line, column } = context.locator.location(getNodeStart(m));
      failures.push({
        filePath: context.filePath,
        ruleName: RULE_NAME,
        message: `'${name}' is a writable non-private property; mark it readonly and use a signal, or mark it private.`,
        line,
        column,
        severity: 'error',
        fix: RECOMMENDATIONS[RULE_NAME],
      });
    }

    return failures.length > 0 ? failures : null;
  }
);
