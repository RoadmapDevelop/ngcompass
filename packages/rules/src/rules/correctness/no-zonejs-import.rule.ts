import { ImportDeclaration } from '@ngcompass/ast';
import { RuleContext, RuleFailure } from '@ngcompass/common';
import { createImportDeclarationRule } from '@ngcompass/engine';
import { RECOMMENDATIONS } from '../../recommendations';
import {
  getNodeStart,
} from '../../rule-utils';
import type { AstNode } from '../../models/index.js';

const RULE_NAME = 'no-zonejs-import';

export const noZoneJsImportRule = createImportDeclarationRule(
  RULE_NAME,
  (node: ImportDeclaration, context: RuleContext): RuleFailure | null => {
    const source = node.source;
    if (!source || typeof source.value !== 'string') return null;
    if (source.value !== 'zone.js' && !source.value.startsWith('zone.js/')) {
      return null;
    }

    const astNode = node as unknown as AstNode;
    const { line, column } = context.locator.location(getNodeStart(astNode));
    return {
      filePath: context.filePath,
      ruleName: RULE_NAME,
      message:
        "Do not import 'zone.js'; remove it from the polyfills entry point of a zoneless application.",
      line,
      column,
      severity: 'error',
      fix: RECOMMENDATIONS[RULE_NAME],
    };
  }
);
