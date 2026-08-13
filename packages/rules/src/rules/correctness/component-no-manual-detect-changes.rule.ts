import ts from 'typescript';
import {
  AnyAngularClassNode,
  ChangeDetectionStrategy,
  analyzeComponent,
} from '@ngcompass/ast';
import { RuleContext, RuleFailure } from '@ngcompass/common';
import { createAnyAngularClassRule } from '@ngcompass/engine';
import { CODE_EXAMPLES, RECOMMENDATIONS } from '../../recommendations';
import {
  ensureRuleSourceFile,
  getNodeStart,
} from '../../rule-utils';
import type { AstNode } from '../../models/index.js';

const RULE_NAME = 'component-no-manual-detect-changes';

const DISCOURAGED_CDR_METHODS = new Set(['detectChanges', 'markForCheck']);

interface ComponentInfo {
  readonly isComponent: boolean;
  readonly isOnPush: boolean;
}

export const componentNoManualDetectChangesRule = createAnyAngularClassRule(
  RULE_NAME,
  (
    classNodeWrapper: AnyAngularClassNode,
    context: RuleContext
  ): RuleFailure[] | null => {
    const oxcClass = classNodeWrapper.node as AstNode;
    const info = describeComponent(oxcClass);
    if (!info.isComponent) return null;

    const { typeChecker, angularTypes } = context;
    if (!typeChecker || !angularTypes) return null;

    const tsClass = findTsClass(oxcClass, context);
    if (!tsClass) return null;

    const failures: RuleFailure[] = [];
    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node)) {
        const failure = classifyCdrCall(
          node,
          typeChecker,
          angularTypes,
          info,
          context
        );
        if (failure) failures.push(failure);
      }
      ts.forEachChild(node, visit);
    };
    visit(tsClass);

    return failures.length > 0 ? failures : null;
  }
);

function describeComponent(classNode: AstNode): ComponentInfo {
  const metadata = analyzeComponent(classNode as never);
  if (metadata?.type !== 'Component') {
    return { isComponent: false, isOnPush: false };
  }
  const isOnPush =
    metadata.changeDetection?.kind === 'literal' &&
    metadata.changeDetection.value === ChangeDetectionStrategy.OnPush;
  return { isComponent: true, isOnPush };
}

function classifyCdrCall(
  call: ts.CallExpression,
  typeChecker: ts.TypeChecker,
  angularTypes: NonNullable<RuleContext['angularTypes']>,
  info: ComponentInfo,
  context: RuleContext
): RuleFailure | null {
  if (!ts.isPropertyAccessExpression(call.expression)) return null;

  const methodName = call.expression.name.text;
  if (!DISCOURAGED_CDR_METHODS.has(methodName)) return null;

  if (info.isOnPush && methodName === 'markForCheck') return null;

  const receiverType = typeChecker.getTypeAtLocation(
    call.expression.expression
  );
  if (!angularTypes.isChangeDetectorRef(receiverType)) return null;

  const { line, column } = context.locator.location(call.getStart());
  return {
    filePath: context.filePath,
    ruleName: RULE_NAME,
    message: info.isOnPush
      ? 'Manual change detection in an OnPush component couples rendering to imperative calls.'
      : `Manual change detection (${methodName}) can hide state-flow bugs and make rendering harder to predict.`,
    line,
    column,
    severity: info.isOnPush ? 'warn' : 'error',
    fix: RECOMMENDATIONS[RULE_NAME],
    codeExample: CODE_EXAMPLES[RULE_NAME],
  };
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
