import ts from 'typescript';
import { RuleFailure, RuleContext } from '@ngcompass/common';
import { CallExpression } from '@ngcompass/ast';
import { createCallExpressionRule } from '@ngcompass/engine';
import { RECOMMENDATIONS } from '../../recommendations';
import {
  AstNode,
  ensureRuleSourceFile,
  findObservableSourceCall,
  getNodeStart,
  hasTeardownInReceiverChain,
  isAngularComponentOrDirectiveFile,
  isLikelyHttpObservable,
  isMemberExpressionLike,
  isSubscribeCall,
  unwrapNode,
} from '../../rule-utils';

const manualTeardownCache = new Map<string, boolean>();
const CACHE_LIMIT = 500;

export function hasManualTeardownInNgOnDestroy(context: RuleContext): boolean {
  const sourceFile = ensureRuleSourceFile(context);
  if (!sourceFile) return false;

  for (const statement of sourceFile.statements) {
    if (!ts.isClassDeclaration(statement)) continue;
    for (const member of statement.members) {
      if (!ts.isMethodDeclaration(member)) continue;
      if (
        !member.name ||
        !ts.isIdentifier(member.name) ||
        member.name.text !== 'ngOnDestroy'
      )
        continue;
      if (!member.body) continue;

      let found = false;
      const visit = (node: ts.Node): void => {
        if (found) return;
        if (
          ts.isCallExpression(node) &&
          ts.isPropertyAccessExpression(node.expression) &&
          node.expression.name.text === 'unsubscribe' &&
          node.arguments.length === 0
        ) {
          found = true;
          return;
        }
        ts.forEachChild(node, visit);
      };
      visit(member.body);
      if (found) return true;
    }
  }
  return false;
}

function hasManualTeardownCached(context: RuleContext): boolean {
  const cached = manualTeardownCache.get(context.filePath);
  if (cached !== undefined) return cached;

  const result = hasManualTeardownInNgOnDestroy(context);
  if (manualTeardownCache.size >= CACHE_LIMIT) manualTeardownCache.clear();
  manualTeardownCache.set(context.filePath, result);
  return result;
}

export const rxjsRequireTakeUntilDestroyedRule = createCallExpressionRule(
  'rxjs-require-takeUntilDestroyed',
  (node: CallExpression, context: RuleContext): RuleFailure | null => {
    if (!isAngularComponentOrDirectiveFile(context)) return null;

    const astNode = node as unknown as AstNode;
    if (!isSubscribeCall(astNode)) return null;

    const callee = unwrapNode(astNode.callee);
    const receiver = isMemberExpressionLike(callee) ? callee?.object : null;

    if (receiver && hasTeardownInReceiverChain(receiver)) return null;

    const sourceCall = findObservableSourceCall(receiver);
    if (isLikelyHttpObservable(sourceCall)) return null;

    if (hasManualTeardownCached(context)) return null;

    const start = getNodeStart(astNode);
    const { line, column } = context.locator.location(start);

    return {
      filePath: context.filePath,
      ruleName: 'rxjs-require-takeUntilDestroyed',
      message:
        'A component subscription without teardown can keep running after the component is destroyed.',
      line,
      column,
      severity: 'error',
      fix: RECOMMENDATIONS['rxjs-require-takeUntilDestroyed'],
    };
  },
  { requires: { typeChecker: true } }
);
