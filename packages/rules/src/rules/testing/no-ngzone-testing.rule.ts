import { CallExpression, walkProgram } from '@ngcompass/ast';
import { RuleContext, RuleFailure } from '@ngcompass/common';
import { createCallExpressionRule } from '@ngcompass/engine';
import { RECOMMENDATIONS } from '../../recommendations';
import {
  AstNode,
  getNodeStart,
  getStaticPropertyName,
  isMemberExpressionLike,
} from '../../rule-utils';

const RULE_NAME = 'no-ngzone-testing';
const SCAN_CACHE_LIMIT = 500;
const scannedFiles = new Map<string, ReadonlyArray<RuleFailure>>();

function isSpecFile(filePath: string): boolean {
  return /\.(spec|test)\.(ts|tsx)$/i.test(filePath);
}

function scanFile(context: RuleContext): ReadonlyArray<RuleFailure> {
  const failures: RuleFailure[] = [];
  const program = context.program;
  if (!program) return failures;

  walkProgram(program as unknown as { type: string }, (rawNode) => {
    const n = rawNode as AstNode;
    if (!isMemberExpressionLike(n)) return;
    if (getStaticPropertyName(n) !== 'ngZone') return;

    const { line, column } = context.locator.location(getNodeStart(n));
    failures.push({
      filePath: context.filePath,
      ruleName: RULE_NAME,
      message:
        'Avoid fixture.ngZone in tests; it is useless and null in a zoneless application.',
      line,
      column,
      severity: 'error',
      fix: RECOMMENDATIONS[RULE_NAME],
    });
  });

  return failures;
}

export const noNgZoneTestingRule = createCallExpressionRule(
  RULE_NAME,
  (_node: CallExpression, context: RuleContext): RuleFailure[] | null => {
    if (!isSpecFile(context.filePath)) return null;

    const cached = scannedFiles.get(context.filePath);
    if (cached !== undefined) return null;

    const failures = scanFile(context);
    if (scannedFiles.size >= SCAN_CACHE_LIMIT) scannedFiles.clear();
    scannedFiles.set(context.filePath, failures);

    return failures.length > 0 ? [...failures] : null;
  }
);
