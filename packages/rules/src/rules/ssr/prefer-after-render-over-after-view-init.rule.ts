import ts from 'typescript';
import { AnyAngularClassNode } from '@ngcompass/ast';
import { RuleFailure, RuleContext } from '@ngcompass/common';
import { createAnyAngularClassRule } from '@ngcompass/engine';
import { RECOMMENDATIONS, CODE_EXAMPLES } from '../../recommendations';
import {
  ensureRuleSourceFile,
  getNodeStart,
  isDomLibSymbol,
} from '../../rule-utils';
import type { AstNode } from '../../models/index.js';

const RULE_NAME = 'prefer-after-render-over-after-view-init';
const LIFECYCLE_HOOKS = new Set(['ngAfterViewInit', 'ngAfterContentInit']);

export const preferAfterRenderOverAfterViewInitRule = createAnyAngularClassRule(
  RULE_NAME,
  (
    streamNode: AnyAngularClassNode,
    context: RuleContext
  ): RuleFailure[] | null => {
    if (
      streamNode.decoratorName !== 'Component' &&
      streamNode.decoratorName !== 'Directive'
    )
      return null;

    const { typeChecker } = context;
    if (!typeChecker) return null;

    const tsClass = findTsClass(streamNode.node as unknown as AstNode, context);
    if (!tsClass) return null;

    const failures: RuleFailure[] = [];

    for (const member of tsClass.members) {
      if (!ts.isMethodDeclaration(member) || !member.body) continue;
      if (!ts.isIdentifier(member.name)) continue;
      const hookName = member.name.text;
      if (!LIFECYCLE_HOOKS.has(hookName)) continue;
      if (!bodyTouchesDom(member.body, typeChecker)) continue;

      const { line, column } = context.locator.location(member.getStart());
      failures.push({
        filePath: context.filePath,
        ruleName: RULE_NAME,
        message: `\`${hookName}\` contains DOM access that can run before browser-only APIs are safe.`,
        line,
        column,
        severity: 'warn',
        fix: RECOMMENDATIONS[RULE_NAME],
        codeExample: CODE_EXAMPLES[RULE_NAME],
      });
    }
    return failures.length ? failures : null;
  },
  { requires: { typeChecker: true }, minAngularVersion: '16.0' }
);

function bodyTouchesDom(node: ts.Node, typeChecker: ts.TypeChecker): boolean {
  let found = false;

  const visit = (n: ts.Node): void => {
    if (found) return;

    if (ts.isPropertyAccessExpression(n)) {
      const receiverType = typeChecker.getTypeAtLocation(n.expression);
      if (typeOriginatesInDom(receiverType)) {
        found = true;
        return;
      }
    } else if (ts.isElementAccessExpression(n)) {
      const receiverType = typeChecker.getTypeAtLocation(n.expression);
      if (typeOriginatesInDom(receiverType)) {
        found = true;
        return;
      }
    } else if (ts.isIdentifier(n) && !isPropertyName(n)) {
      const symbol = typeChecker.getSymbolAtLocation(n);
      const resolved =
        symbol && symbol.flags & ts.SymbolFlags.Alias
          ? typeChecker.getAliasedSymbol(symbol)
          : symbol;
      if (isDomLibSymbol(resolved ?? undefined)) {
        found = true;
        return;
      }
    }

    ts.forEachChild(n, visit);
  };

  visit(node);
  return found;
}

function typeOriginatesInDom(type: ts.Type): boolean {
  const symbol = type.aliasSymbol ?? type.symbol;
  if (!symbol) return false;
  return isDomLibSymbol(symbol);
}

function isPropertyName(id: ts.Identifier): boolean {
  const parent = id.parent;
  if (!parent) return false;
  if (ts.isPropertyAccessExpression(parent) && parent.name === id) return true;
  if (ts.isQualifiedName(parent) && parent.right === id) return true;
  return false;
}

function findTsClass(
  oxcClassNode: AstNode,
  context: RuleContext
): ts.ClassDeclaration | undefined {
  const sourceFile = ensureRuleSourceFile(context);
  if (!sourceFile) return undefined;
  const pos = getNodeStart(oxcClassNode);
  for (const statement of sourceFile.statements) {
    if (
      ts.isClassDeclaration(statement) &&
      statement.pos <= pos &&
      pos <= statement.end
    ) {
      return statement;
    }
  }
  return undefined;
}
