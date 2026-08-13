import ts from 'typescript';
import { AnyAngularClassNode } from '@ngcompass/ast';
import { RuleContext, RuleFailure } from '@ngcompass/common';
import { createAnyAngularClassRule } from '@ngcompass/engine';
import { CODE_EXAMPLES, RECOMMENDATIONS } from '../../recommendations';
import {
  ensureRuleSourceFile,
  getNodeStart,
} from '../../rule-utils';
import type { AstNode } from '../../models/index.js';

const RULE_NAME = 'signal-prefer-output-function';

export const signalPreferOutputFunctionRule = createAnyAngularClassRule(
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

    const { typeChecker, angularTypes } = context;
    if (!typeChecker || !angularTypes) return null;

    const tsClass = findTsClass(classNodeWrapper.node as AstNode, context);
    if (!tsClass) return null;

    const failures: RuleFailure[] = [];

    for (const member of tsClass.members) {
      if (!ts.isPropertyDeclaration(member)) continue;
      if (!hasAngularOutputDecorator(member, typeChecker, angularTypes))
        continue;
      if (!memberIsEventEmitter(member, typeChecker, angularTypes)) continue;

      const name = getPropertyName(member) ?? '(unknown)';
      const { line, column } = context.locator.location(member.getStart());
      failures.push({
        filePath: context.filePath,
        ruleName: RULE_NAME,
        message: `'${name}' uses @Output() EventEmitter, which adds boilerplate compared with output().`,
        line,
        column,
        severity: 'warn',
        fix: RECOMMENDATIONS[RULE_NAME],
        codeExample: CODE_EXAMPLES[RULE_NAME],
      });
    }
    return failures.length > 0 ? failures : null;
  },
  { requires: { typeChecker: true }, minAngularVersion: '17.3' }
);

function hasAngularOutputDecorator(
  member: ts.PropertyDeclaration,
  typeChecker: ts.TypeChecker,
  angularTypes: NonNullable<RuleContext['angularTypes']>
): boolean {
  const decorators = ts.getDecorators(member);
  if (!decorators) return false;

  for (const dec of decorators) {
    const expr = ts.isCallExpression(dec.expression)
      ? dec.expression.expression
      : dec.expression;
    if (!ts.isIdentifier(expr) || expr.text !== 'Output') continue;

    const symbol = typeChecker.getSymbolAtLocation(expr);
    const resolved =
      symbol && symbol.flags & ts.SymbolFlags.Alias
        ? typeChecker.getAliasedSymbol(symbol)
        : symbol;
    if (angularTypes.isFromAngularCore(resolved)) return true;
  }
  return false;
}

function memberIsEventEmitter(
  member: ts.PropertyDeclaration,
  typeChecker: ts.TypeChecker,
  angularTypes: NonNullable<RuleContext['angularTypes']>
): boolean {
  if (member.type) {
    const declaredType = typeChecker.getTypeFromTypeNode(member.type);
    if (angularTypes.isEventEmitter(declaredType)) return true;
  }

  if (member.initializer) {
    const initType = typeChecker.getTypeAtLocation(member.initializer);
    if (angularTypes.isEventEmitter(initType)) return true;
  }

  const symbol = typeChecker.getSymbolAtLocation(member.name);
  if (symbol) {
    const symbolType = typeChecker.getTypeOfSymbolAtLocation(symbol, member);
    if (angularTypes.isEventEmitter(symbolType)) return true;
  }

  return false;
}

function getPropertyName(member: ts.PropertyDeclaration): string | undefined {
  const name = member.name;
  if (ts.isIdentifier(name)) return name.text;
  if (ts.isStringLiteral(name)) return name.text;
  return undefined;
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
