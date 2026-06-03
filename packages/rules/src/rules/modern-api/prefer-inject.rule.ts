import ts from 'typescript';
import { AnyAngularClassNode } from '@ngcompass/ast';
import { RuleContext, RuleFailure } from '@ngcompass/common';
import { createAnyAngularClassRule } from '@ngcompass/engine';
import { CODE_EXAMPLES, RECOMMENDATIONS } from '../../recommendations';
import { AstNode, getNodeStart } from '../../rule-utils';

const RULE_NAME = 'prefer-inject-over-constructor-di';

const DI_PARAMETER_DECORATORS = new Set([
  'Inject',
  'Optional',
  'Self',
  'SkipSelf',
  'Host',
]);

interface DiParameter {
  readonly name: string;
  readonly typeText: string;
}

export const preferInjectRule = createAnyAngularClassRule(
  RULE_NAME,
  (
    classNodeWrapper: AnyAngularClassNode,
    context: RuleContext
  ): RuleFailure | null => {
    const { typeChecker, angularTypes } = context;
    if (!typeChecker || !angularTypes) return null;

    const tsClass = findTsClass(classNodeWrapper.node as AstNode, context);
    if (!tsClass) return null;

    const ctor = tsClass.members.find(ts.isConstructorDeclaration);
    if (!ctor || ctor.parameters.length === 0) return null;

    const diParams: DiParameter[] = [];
    for (const param of ctor.parameters) {
      if (isDiParameter(param, typeChecker, angularTypes)) {
        diParams.push(describeParameter(param));
      }
    }
    if (diParams.length === 0) return null;

    const { line, column } = context.locator.location(ctor.getStart());
    const offenders = diParams
      .map((p) => `${p.name}: ${p.typeText}`)
      .join(', ');

    return {
      filePath: context.filePath,
      ruleName: RULE_NAME,
      message: `Constructor dependency injection makes class setup less composable than inject(). Offending params: ${offenders}.`,
      line,
      column,
      severity: 'warn',
      fix: RECOMMENDATIONS[RULE_NAME],
      codeExample: CODE_EXAMPLES[RULE_NAME],
    };
  },
  { requires: { typeChecker: true } }
);

function isDiParameter(
  param: ts.ParameterDeclaration,
  typeChecker: ts.TypeChecker,
  angularTypes: NonNullable<RuleContext['angularTypes']>
): boolean {
  if (hasAngularDiDecorator(param, typeChecker, angularTypes)) return true;

  if (!param.type) return false;

  const type = typeChecker.getTypeFromTypeNode(param.type);
  if (angularTypes.isInjectionToken(type)) return true;

  const typeSymbol = type.aliasSymbol ?? type.symbol;
  if (!typeSymbol) return false;

  return angularTypes.isInjectableClass(typeSymbol);
}

function hasAngularDiDecorator(
  param: ts.ParameterDeclaration,
  typeChecker: ts.TypeChecker,
  angularTypes: NonNullable<RuleContext['angularTypes']>
): boolean {
  const decorators = ts.getDecorators(param);
  if (!decorators || decorators.length === 0) return false;

  for (const dec of decorators) {
    const calleeIdent = getDecoratorIdentifier(dec);
    if (!calleeIdent || !DI_PARAMETER_DECORATORS.has(calleeIdent.text))
      continue;

    const symbol = typeChecker.getSymbolAtLocation(calleeIdent);
    const resolved =
      symbol && symbol.flags & ts.SymbolFlags.Alias
        ? typeChecker.getAliasedSymbol(symbol)
        : symbol;
    if (angularTypes.isFromAngularCore(resolved)) return true;
  }
  return false;
}

function getDecoratorIdentifier(dec: ts.Decorator): ts.Identifier | undefined {
  const expr = ts.isCallExpression(dec.expression)
    ? dec.expression.expression
    : dec.expression;
  return ts.isIdentifier(expr) ? expr : undefined;
}

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

function describeParameter(param: ts.ParameterDeclaration): DiParameter {
  const name = ts.isIdentifier(param.name) ? param.name.text : '<binding>';
  const typeText = param.type ? param.type.getText() : '<inferred>';
  return { name, typeText };
}
