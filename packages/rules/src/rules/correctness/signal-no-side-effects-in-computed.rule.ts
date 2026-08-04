import ts from 'typescript';
import { CallExpression } from '@ngcompass/ast';
import { RuleContext, RuleFailure } from '@ngcompass/common';
import { createCallExpressionRule } from '@ngcompass/engine';
import { RECOMMENDATIONS } from '../../recommendations';
import { AstNode, getNodeStart, isCalleeNamed } from '../../rule-utils';

const RULE_NAME = 'signal-no-side-effects-in-computed';

const SIGNAL_WRITE_METHODS = new Set(['set', 'update', 'mutate']);

const SUBJECT_EMIT_METHODS = new Set(['next', 'complete', 'error']);

type ViolationKind = 'write' | 'effect';

interface Violation {
  readonly node: ts.Node;
  readonly kind: ViolationKind;
}

interface Context {
  readonly typeChecker: ts.TypeChecker;
  readonly angularTypes: NonNullable<RuleContext['angularTypes']>;
}

export const signalNoSideEffectsInComputedRule = createCallExpressionRule(
  RULE_NAME,
  (node: CallExpression, context: RuleContext): RuleFailure | null => {
    const call = node as unknown as AstNode;
    if (!isCalleeNamed(call.callee, 'computed')) return null;

    const { typeChecker, angularTypes } = context;
    if (!typeChecker || !angularTypes) return null;

    const tsCall = findTsCallAtPosition(context, getNodeStart(call));
    if (!tsCall) return null;

    const callback = tsCall.arguments[0];
    if (
      !callback ||
      !(ts.isArrowFunction(callback) || ts.isFunctionExpression(callback))
    ) {
      return null;
    }

    const violation = findFirstViolation(callback.body, {
      typeChecker,
      angularTypes,
    });
    if (!violation) return null;

    return createFailure(violation, call, context);
  },
  { requires: { typeChecker: true }, minAngularVersion: '16.0' }
);

function findFirstViolation(
  node: ts.Node,
  ctx: Context
): Violation | undefined {
  let found: Violation | undefined;

  const visit = (current: ts.Node): void => {
    if (found) return;

    const direct = classifyExpression(current, ctx);
    if (direct) {
      found = direct;
      return;
    }

    if (isFunctionBoundary(current)) return;
    ts.forEachChild(current, visit);
  };

  visit(node);
  return found;
}

function classifyExpression(
  node: ts.Node,
  ctx: Context
): Violation | undefined {
  if (
    ts.isBinaryExpression(node) &&
    isAssignmentOperator(node.operatorToken.kind)
  ) {
    if (isPropertyTarget(node.left)) {
      return { node, kind: 'write' };
    }
    return undefined;
  }

  if (ts.isPostfixUnaryExpression(node) || ts.isPrefixUnaryExpression(node)) {
    const isIncrementOrDecrement =
      node.operator === ts.SyntaxKind.PlusPlusToken ||
      node.operator === ts.SyntaxKind.MinusMinusToken;
    if (isIncrementOrDecrement && isPropertyTarget(node.operand)) {
      return { node, kind: 'write' };
    }
    return undefined;
  }

  if (ts.isDeleteExpression(node) && isPropertyTarget(node.expression)) {
    return { node, kind: 'write' };
  }

  if (ts.isCallExpression(node)) {
    return classifyCall(node, ctx);
  }

  return undefined;
}

function classifyCall(
  node: ts.CallExpression,
  ctx: Context
): Violation | undefined {
  if (!ts.isPropertyAccessExpression(node.expression)) return undefined;

  const method = node.expression.name.text;
  const receiver = node.expression.expression;
  const receiverType = ctx.typeChecker.getTypeAtLocation(receiver);

  if (
    SIGNAL_WRITE_METHODS.has(method) &&
    ctx.angularTypes.isWritableSignal(receiverType)
  ) {
    return { node, kind: 'write' };
  }

  if (
    SUBJECT_EMIT_METHODS.has(method) &&
    ctx.angularTypes.isSubjectLike(receiverType)
  ) {
    return { node, kind: 'effect' };
  }

  if (ctx.angularTypes.isHttpClient(receiverType)) {
    return { node, kind: 'effect' };
  }

  return undefined;
}

function isAssignmentOperator(kind: ts.SyntaxKind): boolean {
  return (
    kind >= ts.SyntaxKind.FirstAssignment &&
    kind <= ts.SyntaxKind.LastAssignment
  );
}

function isPropertyTarget(node: ts.Node): boolean {
  return (
    ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)
  );
}

function isFunctionBoundary(node: ts.Node): boolean {
  return (
    ts.isArrowFunction(node) ||
    ts.isFunctionExpression(node) ||
    ts.isFunctionDeclaration(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isGetAccessorDeclaration(node) ||
    ts.isSetAccessorDeclaration(node)
  );
}

function findTsCallAtPosition(
  context: RuleContext,
  position: number
): ts.CallExpression | undefined {
  const sourceFile = ensureSourceFile(context);
  if (!sourceFile) return undefined;

  let result: ts.CallExpression | undefined;

  const visit = (node: ts.Node): void => {
    if (result) return;
    if (ts.isCallExpression(node) && node.getStart() === position) {
      result = node;
      return;
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return result;
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

function createFailure(
  violation: Violation,
  call: AstNode,
  context: RuleContext
): RuleFailure {
  const start = violation.node.getStart();
  const { line, column } = context.locator.location(
    start || getNodeStart(call)
  );

  return {
    filePath: context.filePath,
    ruleName: RULE_NAME,
    message:
      violation.kind === 'write'
        ? 'computed() writes to state, which can create reactive cycles.'
        : 'computed() contains a side effect, so it is no longer a pure derivation.',
    line,
    column,
    severity: 'error',
    fix: RECOMMENDATIONS[RULE_NAME],
  };
}
