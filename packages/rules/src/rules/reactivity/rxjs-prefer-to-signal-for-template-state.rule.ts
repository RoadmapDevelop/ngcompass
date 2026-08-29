import ts from 'typescript';
import { AnyAngularClassNode } from '@ngcompass/ast';
import { RuleFailure, RuleContext } from '@ngcompass/common';
import { createAnyAngularClassRule } from '@ngcompass/engine';
import { RECOMMENDATIONS } from '../../recommendations';
import {
  ensureRuleSourceFile,
  getNodeStart,
} from '../../rule-utils';
import type { AstNode } from '../../models/index.js';

const RULE_NAME = 'rxjs-prefer-toSignal-for-template-state';

export const rxjsPreferToSignalRule = createAnyAngularClassRule(
  RULE_NAME,
  (
    streamNode: AnyAngularClassNode,
    context: RuleContext
  ): RuleFailure[] | null => {
    const meta = (streamNode as unknown as { metadata?: { type?: string } })
      .metadata;
    if (meta?.type !== 'Component') return null;

    const templateRefs = context.crossRef?.templateReferences;
    if (templateRefs === undefined) return null;

    const { typeChecker, angularTypes } = context;
    if (!typeChecker || !angularTypes) return null;

    const tsClass = findTsClass(streamNode.node as unknown as AstNode, context);
    if (!tsClass) return null;

    const failures: RuleFailure[] = [];

    for (const member of tsClass.members) {
      if (!ts.isPropertyDeclaration(member)) continue;
      const name = getMemberName(member);
      if (!name) continue;
      if (!templateRefs.has(name) && !templateRefs.has(stripDollar(name)))
        continue;
      if (hasAngularOutputDecorator(member, typeChecker, angularTypes))
        continue;

      const memberType = typeChecker.getTypeAtLocation(member);
      if (
        !angularTypes.isObservable(memberType) &&
        !angularTypes.isSubjectLike(memberType)
      )
        continue;

      const { line, column } = context.locator.location(member.getStart());
      failures.push({
        filePath: context.filePath,
        ruleName: RULE_NAME,
        message: `Observable "${name}" is read by the template, which can add async-pipe churn and weaker signal integration.`,
        line,
        column,
        severity: 'warn',
        fix: RECOMMENDATIONS[RULE_NAME],
      });
    }

    return failures.length ? failures : null;
  },
  {
    requires: { projectContext: true, htmlAst: true, typeChecker: true },
    minAngularVersion: '16.0',
  }
);

function getMemberName(member: ts.PropertyDeclaration): string | undefined {
  if (ts.isIdentifier(member.name)) return member.name.text;
  if (ts.isStringLiteral(member.name)) return member.name.text;
  return undefined;
}

function stripDollar(name: string): string {
  return name.endsWith('$') ? name.slice(0, -1) : name;
}

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
