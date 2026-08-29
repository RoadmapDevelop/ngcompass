import { AnyAngularClassNode } from '@ngcompass/ast';
import { RuleContext, RuleFailure } from '@ngcompass/common';
import { createAnyAngularClassRule } from '@ngcompass/engine';
import { CODE_EXAMPLES, RECOMMENDATIONS } from '../../recommendations';
import {
  getClassBody,
  getNodeStart,
  unwrapNode,
} from '../../rule-utils';
import type { AstNode } from '../../models/index.js';

const RULE_NAME = 'signal-prefer-input-signal';

function isInputDecorator(node: AstNode): boolean {
  const expr = unwrapNode(node.expression ?? node);
  if (!expr) return false;
  if (expr.type === 'Identifier') return expr.name === 'Input';
  if (expr.type === 'CallExpression') {
    const callee = unwrapNode(expr.callee);
    return callee?.type === 'Identifier' && callee.name === 'Input';
  }
  return false;
}

export const signalPreferInputSignalRule = createAnyAngularClassRule(
  RULE_NAME,
  (
    classNodeWrapper: AnyAngularClassNode,
    context: RuleContext
  ): RuleFailure[] | null => {
    if (
      classNodeWrapper.decoratorName !== 'Component' &&
      classNodeWrapper.decoratorName !== 'Directive'
    )
      return null;

    const classBody = getClassBody(classNodeWrapper.node as AstNode);
    const failures: RuleFailure[] = [];
    const isStandalone =
      context.project?.standaloneComponents?.has(context.filePath) ?? false;

    for (const member of classBody) {
      const m = unwrapNode(member);
      if (
        !m ||
        (m.type !== 'PropertyDefinition' && m.type !== 'AccessorProperty') ||
        !Array.isArray(m.decorators)
      )
        continue;

      if (m.decorators.some(isInputDecorator)) {
        const start = getNodeStart(m);
        const { line, column } = context.locator.location(start);
        const key = unwrapNode(m.key);
        const name =
          (key?.type === 'Identifier'
            ? key.name
            : key?.type === 'Literal'
              ? String(key.value)
              : '') || '(unknown)';

        let msg = `'${name}' uses @Input(), which keeps this input outside Angular's signal graph.`;
        if (isStandalone)
          msg += ' Standalone declarations benefit most from signal inputs.';

        failures.push({
          filePath: context.filePath,
          ruleName: RULE_NAME,
          message: msg,
          line,
          column,
          severity: isStandalone ? 'error' : 'warn',
          fix: RECOMMENDATIONS[RULE_NAME],
          codeExample: CODE_EXAMPLES[RULE_NAME],
        });
      }
    }
    return failures.length > 0 ? failures : null;
  },
  { requires: { projectContext: true }, minAngularVersion: '17.1' }
);
