import { NewExpression } from '@ngcompass/ast';
import { RuleContext, RuleFailure } from '@ngcompass/common';
import { createNewExpressionRule } from '@ngcompass/engine';
import { RECOMMENDATIONS } from '../../recommendations';
import {
  getNodeStart,
  unwrapNode,
} from '../../rule-utils';
import type { AstNode } from '../../models/index.js';

const RULE_NAME = 'no-reactive-forms';

const REACTIVE_FORM_CONSTRUCTORS = new Set([
  'FormControl',
  'FormGroup',
  'FormArray',
  'FormRecord',
  'UntypedFormControl',
  'UntypedFormGroup',
  'UntypedFormArray',
  'UntypedFormRecord',
  'FormBuilder',
  'NonNullableFormBuilder',
  'UntypedFormBuilder',
]);

export const noReactiveFormsRule = createNewExpressionRule(
  RULE_NAME,
  (node: NewExpression, context: RuleContext): RuleFailure | null => {
    const astNode = node as unknown as AstNode;
    const callee = unwrapNode(astNode.callee);
    if (!callee || callee.type !== 'Identifier') return null;

    const name = callee.name as string;
    if (!REACTIVE_FORM_CONSTRUCTORS.has(name)) return null;

    const { line, column } = context.locator.location(getNodeStart(astNode));
    return {
      filePath: context.filePath,
      ruleName: RULE_NAME,
      message: `Avoid ${name}; use signal forms (form()) in a zoneless application — parts of legacy reactive forms are not reactive without zone.js.`,
      line,
      column,
      severity: 'error',
      fix: RECOMMENDATIONS[RULE_NAME],
    };
  }
);
