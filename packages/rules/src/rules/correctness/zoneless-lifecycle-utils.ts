import { AnyAngularClassNode } from '@ngcompass/ast';
import { RuleContext, RuleFailure } from '@ngcompass/common';
import { createAnyAngularClassRule } from '@ngcompass/engine';
import { RECOMMENDATIONS } from '../../recommendations';
import {
  getClassBody,
  getMethodName,
  getNodeStart,
  isMethodDefinition,
} from '../../rule-utils';
import type { AstNode } from '../../models/index.js';
import type { RuleHandler } from '@ngcompass/engine';
import type { AnyAngularClassNode as ClassStreamNode } from '@ngcompass/ast';

export function createLifecycleHookRule(
  ruleName: string,
  hookName: string,
  message: string
): RuleHandler<ClassStreamNode> {
  return createAnyAngularClassRule(
    ruleName,
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
        if (getMethodName(member) !== hookName) continue;

        const { line, column } = context.locator.location(getNodeStart(member));
        failures.push({
          filePath: context.filePath,
          ruleName,
          message,
          line,
          column,
          severity: 'error',
          fix: RECOMMENDATIONS[ruleName],
        });
      }

      return failures.length > 0 ? failures : null;
    }
  );
}
