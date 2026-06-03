import ts from 'typescript';
import { AnyAngularClassNode } from '@ngcompass/ast';
import { RuleContext, RuleFailure } from '@ngcompass/common';
import { createAnyAngularClassRule } from '@ngcompass/engine';
import { CODE_EXAMPLES, RECOMMENDATIONS } from '../../recommendations.js';
import { AstNode, getNodeStart } from '../../rule-utils.js';

const RULE_NAME = 'no-ngzone';

export const noNgZoneRule = createAnyAngularClassRule(
  RULE_NAME,
  (
    classNodeWrapper: AnyAngularClassNode,
    context: RuleContext
  ): RuleFailure[] | null => {
    const { typeChecker, angularTypes } = context;
    if (!typeChecker || !angularTypes) return null;

    const checker = typeChecker;
    const types = angularTypes;

    const tsClass = findTsClass(classNodeWrapper.node as AstNode, context);
    if (!tsClass) return null;

    const failures: RuleFailure[] = [];

    function visit(node: ts.Node) {
      if (ts.isCallExpression(node)) {
        const callee = node.expression;
        if (ts.isIdentifier(callee) && callee.text === 'inject') {
          const arg = node.arguments[0];
          if (arg) {
            const symbol = checker.getSymbolAtLocation(arg);
            const resolved =
              symbol && symbol.flags & ts.SymbolFlags.Alias
                ? checker.getAliasedSymbol(symbol)
                : symbol;
            if (
              resolved &&
              resolved.name === 'NgZone' &&
              types.isFromPackage(resolved, '@angular/core')
            ) {
              const { line, column } = context.locator.location(node.getStart());
              failures.push({
                filePath: context.filePath,
                ruleName: RULE_NAME,
                message:
                  'Do not inject NgZone; it is useless and does not work in a zoneless application.',
                line,
                column,
                severity: 'error',
                fix: RECOMMENDATIONS[RULE_NAME],
                codeExample: CODE_EXAMPLES[RULE_NAME],
              });
            }
          }
        }
      } else if (ts.isParameter(node)) {
        if (node.type) {
          const type = checker.getTypeFromTypeNode(node.type);
          const symbol = type.aliasSymbol ?? type.symbol;
          if (
            symbol &&
            symbol.name === 'NgZone' &&
            types.isFromPackage(symbol, '@angular/core')
          ) {
            const { line, column } = context.locator.location(node.getStart());
            failures.push({
              filePath: context.filePath,
              ruleName: RULE_NAME,
              message:
                'Do not inject NgZone; it is useless and does not work in a zoneless application.',
              line,
              column,
              severity: 'error',
              fix: RECOMMENDATIONS[RULE_NAME],
              codeExample: CODE_EXAMPLES[RULE_NAME],
            });
          }
        }
      }

      ts.forEachChild(node, visit);
    }

    visit(tsClass);

    return failures.length > 0 ? failures : null;
  },
  { requires: { typeChecker: true } }
);

function findTsClass(
  oxcClassNode: AstNode,
  context: RuleContext
): ts.ClassDeclaration | undefined {
  const sourceFile = ensureSourceFile(context);
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

function ensureSourceFile(context: RuleContext): ts.SourceFile | undefined {
  type Mutable = RuleContext & { sourceFile?: ts.SourceFile };
  const mutable = context as Mutable;
  if (mutable.sourceFile) return mutable.sourceFile;
  if (!context.fileContent) return undefined;
  mutable.sourceFile = ts.createSourceFile(
    context.filePath,
    context.fileContent,
    ts.ScriptTarget.Latest,
    true
  );
  return mutable.sourceFile;
}
