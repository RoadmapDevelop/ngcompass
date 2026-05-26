import ts from 'typescript';
import { TemplateExpressionNode } from '@ngcompass/ast';
import { RuleContext, RuleFailure } from '@ngcompass/common';
import { createTemplateExpressionRule } from '@ngcompass/engine';
import { RECOMMENDATIONS } from '../../recommendations';
import {
  AstNode,
  MaybeAstNode,
  childNodes,
  getStaticPropertyName,
  isMemberExpressionLike,
  unwrapNode,
  getTemplateAbsoluteOffset,
} from '../../rule-utils';

const RULE_NAME = 'template-no-call-expression';

const ALLOWED_FREE_CALL_NAMES = new Set(['translate', '$localize', '$any']);

const ALLOWED_MEMBER_CALL_NAMES = new Set([
  'slice',
  'toString',
  'toFixed',
  'toUpperCase',
  'toLowerCase',
  'trim',
  'join',
  'includes',
  'indexOf',
  'startsWith',
  'endsWith',
  'charAt',
  'substring',
  'replace',
  'split',
  'concat',
  'toISOString',
  'toLocaleDateString',
  'toLocaleTimeString',
  'toLocaleString',
]);

function isCallExpressionLike(node: MaybeAstNode): boolean {
  const unwrapped = unwrapNode(node);
  return (
    !!unwrapped &&
    (unwrapped.type === 'CallExpression' ||
      unwrapped.type === 'OptionalCallExpression')
  );
}

function getCallArguments(node: MaybeAstNode): AstNode[] {
  const unwrapped = unwrapNode(node);
  return Array.isArray(unwrapped?.arguments) ? unwrapped.arguments : [];
}

function getCallName(node: MaybeAstNode): string {
  const unwrapped = unwrapNode(node);
  if (!unwrapped) return '';

  const callee = unwrapNode(unwrapped.callee);
  if (!callee) return '';

  if (callee.type === 'Identifier') {
    return (callee.name as string) ?? '';
  }
  if (isMemberExpressionLike(callee)) {
    return getStaticPropertyName(callee);
  }
  return '';
}

function isAllowedCall(node: MaybeAstNode): boolean {
  const unwrapped = unwrapNode(node);
  if (!unwrapped || !isCallExpressionLike(unwrapped)) return false;

  const callee = unwrapNode(unwrapped.callee);
  if (!callee) return false;

  if (callee.type === 'Identifier') {
    return ALLOWED_FREE_CALL_NAMES.has(callee.name as string);
  }

  if (!isMemberExpressionLike(callee)) return false;

  const methodName = getStaticPropertyName(callee);
  return !!methodName && ALLOWED_MEMBER_CALL_NAMES.has(methodName);
}

function isSignalRead(name: string, context: RuleContext): boolean {
  if (context.crossRef?.signalMembers?.has(name)) return true;

  const { typeChecker, angularTypes, crossRef } = context;
  if (!typeChecker || !angularTypes || !crossRef?.componentPath) return false;

  const memberType = resolveComponentMemberType(
    name,
    crossRef.componentPath,
    typeChecker
  );
  return memberType ? angularTypes.isSignal(memberType) : false;
}

function resolveComponentMemberType(
  name: string,
  componentPath: string,
  typeChecker: ts.TypeChecker
): ts.Type | undefined {
  const program = (
    typeChecker as ts.TypeChecker & { getProgram?: () => ts.Program }
  ).getProgram?.();
  const sourceFile = program?.getSourceFile(componentPath);
  if (!sourceFile) return undefined;

  const classDecl = sourceFile.statements.find(ts.isClassDeclaration);
  if (!classDecl) return undefined;

  const classType = typeChecker.getTypeAtLocation(classDecl);
  const member = typeChecker.getPropertyOfType(classType, name);
  if (!member) return undefined;

  const declaration = member.valueDeclaration ?? member.declarations?.[0];
  if (!declaration) return undefined;

  return typeChecker.getTypeOfSymbolAtLocation(member, declaration);
}

function hasFlaggedCallExpression(
  root: MaybeAstNode,
  context: RuleContext
): boolean {
  const stack: AstNode[] = root ? [root] : [];

  while (stack.length > 0) {
    const node = unwrapNode(stack.pop()!);
    if (!node) continue;

    if (isCallExpressionLike(node) && !isAllowedCall(node)) {
      if (getCallArguments(node).length > 0) return true;

      const name = getCallName(node);
      if (name && !isSignalRead(name, context)) return true;
    }

    for (const child of childNodes(node)) {
      stack.push(child);
    }
  }

  return false;
}

function createFailure(
  node: TemplateExpressionNode,
  context: RuleContext
): RuleFailure {
  const offset = getTemplateAbsoluteOffset(context, node.sourceSpan.start);
  const { line, column } = context.locator.location(offset);

  return {
    filePath: context.filePath,
    ruleName: RULE_NAME,
    message:
      'Template method calls run on every change detection cycle and can make rendering slower.',
    line,
    column,
    severity: 'error',
    fix: RECOMMENDATIONS[RULE_NAME],
  };
}

export const templateNoCallExpressionRule = createTemplateExpressionRule(
  RULE_NAME,
  (
    node: TemplateExpressionNode,
    context: RuleContext
  ): RuleFailure[] | null => {
    const expression = node.expression as unknown as AstNode;

    if (!hasFlaggedCallExpression(expression, context)) {
      return null;
    }

    return [createFailure(node, context)];
  },
  {
    requires: { htmlAst: true, typeChecker: true, projectContext: true },
  }
);
