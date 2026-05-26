import ts from 'typescript';
import { CallExpression } from '@ngcompass/ast';
import { RuleContext, RuleFailure } from '@ngcompass/common';
import { createCallExpressionRule } from '@ngcompass/engine';
import { RECOMMENDATIONS } from '../../recommendations';
import {
  AstNode,
  ensureRuleSourceFile,
  getNodeStart,
  isCalleeNamed,
} from '../../rule-utils';

const RULE_NAME = 'signal-prefer-computed-over-sync-effect';

const GLOBAL_ASYNC_NAMES = new Set([
  'setTimeout',
  'setInterval',
  'queueMicrotask',
  'requestAnimationFrame',
]);

const PROMISE_INSTANCE_METHODS = new Set(['then', 'catch', 'finally']);

const SIGNAL_WRITE_METHODS = new Set(['set', 'update', 'mutate']);

interface EffectShape {
  readonly hasSignalRead: boolean;
  readonly hasSignalWrite: boolean;
  readonly hasAsync: boolean;
  readonly hasLinkedSignal: boolean;
  readonly firstWrite?: ts.Node;
}

interface Ctx {
  readonly typeChecker: ts.TypeChecker;
  readonly angularTypes: NonNullable<RuleContext['angularTypes']>;
}

export const signalPreferComputedRule = createCallExpressionRule(
  RULE_NAME,
  (node: CallExpression, context: RuleContext): RuleFailure | null => {
    const call = node as unknown as AstNode;
    if (!isCalleeNamed(call.callee, 'effect')) return null;

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

    const shape = analyzeEffectBody(callback.body, {
      typeChecker,
      angularTypes,
    });
    if (!shape.hasSignalRead || !shape.hasSignalWrite) return null;
    if (shape.hasAsync || shape.hasLinkedSignal) return null;

    const anchor = shape.firstWrite ?? tsCall;
    const { line, column } = context.locator.location(anchor.getStart());
    return {
      filePath: context.filePath,
      ruleName: RULE_NAME,
      message:
        'This effect reads reactive values and writes derived state, which adds extra reactive cycles.',
      line,
      column,
      severity: 'warn',
      fix: RECOMMENDATIONS[RULE_NAME],
    };
  },
  { requires: { typeChecker: true } }
);

function analyzeEffectBody(node: ts.Node, ctx: Ctx): EffectShape {
  let hasSignalRead = false;
  let hasSignalWrite = false;
  let hasAsync = false;
  let hasLinkedSignal = false;
  let firstWrite: ts.Node | undefined;

  const visit = (n: ts.Node): void => {
    if (hasAsync && hasLinkedSignal && hasSignalRead && hasSignalWrite) return;

    if (
      n.kind === ts.SyntaxKind.AwaitExpression ||
      n.kind === ts.SyntaxKind.YieldExpression
    ) {
      hasAsync = true;
    }

    if (ts.isCallExpression(n)) {
      classifyCall(n, ctx, {
        onSignalRead: () => {
          hasSignalRead = true;
        },
        onSignalWrite: () => {
          hasSignalWrite = true;
          firstWrite ??= n;
        },
        onAsync: () => {
          hasAsync = true;
        },
        onLinkedSignal: () => {
          hasLinkedSignal = true;
        },
      });
    }

    ts.forEachChild(n, visit);
  };

  visit(node);
  return {
    hasSignalRead,
    hasSignalWrite,
    hasAsync,
    hasLinkedSignal,
    firstWrite,
  };
}

interface CallHandlers {
  readonly onSignalRead: () => void;
  readonly onSignalWrite: () => void;
  readonly onAsync: () => void;
  readonly onLinkedSignal: () => void;
}

function classifyCall(
  call: ts.CallExpression,
  ctx: Ctx,
  h: CallHandlers
): void {
  if (ts.isPropertyAccessExpression(call.expression)) {
    const method = call.expression.name.text;
    const receiver = call.expression.expression;
    const receiverType = ctx.typeChecker.getTypeAtLocation(receiver);

    if (
      SIGNAL_WRITE_METHODS.has(method) &&
      ctx.angularTypes.isWritableSignal(receiverType)
    ) {
      h.onSignalWrite();
      return;
    }

    if (
      method === 'subscribe' &&
      (ctx.angularTypes.isObservable(receiverType) ||
        ctx.angularTypes.isSubjectLike(receiverType))
    ) {
      h.onAsync();
      return;
    }

    if (PROMISE_INSTANCE_METHODS.has(method) && isPromiseType(receiverType)) {
      h.onAsync();
      return;
    }

    return;
  }

  if (ts.isIdentifier(call.expression)) {
    const name = call.expression.text;

    if (name === 'linkedSignal') {
      h.onLinkedSignal();
      return;
    }

    if (
      GLOBAL_ASYNC_NAMES.has(name) &&
      isGlobalLibSymbol(call.expression, ctx.typeChecker)
    ) {
      h.onAsync();
      return;
    }

    if (
      call.arguments.length === 0 &&
      isSignalTypedCallee(call.expression, ctx)
    ) {
      h.onSignalRead();
    }
  }
}

function isSignalTypedCallee(id: ts.Identifier, ctx: Ctx): boolean {
  const symbol = ctx.typeChecker.getSymbolAtLocation(id);
  if (!symbol) return false;
  const decl = symbol.valueDeclaration ?? symbol.declarations?.[0];
  if (!decl) return false;
  const type = ctx.typeChecker.getTypeOfSymbolAtLocation(symbol, decl);
  return ctx.angularTypes.isSignal(type);
}

function isPromiseType(type: ts.Type): boolean {
  const symbol = type.aliasSymbol ?? type.symbol;
  if (!symbol || symbol.name !== 'Promise') return false;
  return isFromTypeScriptLib(symbol);
}

function isGlobalLibSymbol(
  id: ts.Identifier,
  typeChecker: ts.TypeChecker
): boolean {
  const symbol = typeChecker.getSymbolAtLocation(id);
  if (!symbol) return false;
  return isFromTypeScriptLib(symbol);
}

const TS_LIB_PATH_MARKER = '/typescript/lib/lib.';

function isFromTypeScriptLib(symbol: ts.Symbol): boolean {
  const declarations = symbol.getDeclarations();
  if (!declarations) return false;
  for (const decl of declarations) {
    const file = decl.getSourceFile().fileName.replace(/\\/g, '/');
    if (file.includes(TS_LIB_PATH_MARKER)) return true;
  }
  return false;
}

function findTsCallAtPosition(
  context: RuleContext,
  position: number
): ts.CallExpression | undefined {
  const sourceFile = ensureRuleSourceFile(context);
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
