import { RuleFailure, RuleContext } from "@ngcompass/common";
import { CallExpression } from "@ngcompass/ast";
import { createCallExpressionRule } from '@ngcompass/engine';
import { RECOMMENDATIONS } from "../../recommendations";
import {
    AstNode,
    MaybeAstNode,
    unwrapNode,
    isMemberExpressionLike,
    getStaticPropertyName,
    getTsSymbolAtNode,
    getCalleeName,
    childNodes,
    isCalleeNamed,
    getCallbackArg,
    getFunctionBody,
    getNodeStart
} from "../../rule-utils";

const WRITE_METHODS = new Set(['set', 'update', 'mutate']);
const ASYNC_METHODS = new Set(['setTimeout', 'setInterval', 'queueMicrotask', 'requestAnimationFrame', 'then', 'catch', 'finally', 'subscribe']);
const LINKED_SIGNAL_METHOD = 'linkedSignal';

function isSignalWrite(node: MaybeAstNode): boolean {
    const call = unwrapNode(node);
    if (!call || call.type !== 'CallExpression') return false;
    const callee = unwrapNode(call.callee);
    return isMemberExpressionLike(callee) && WRITE_METHODS.has(getStaticPropertyName(callee) || '');
}

function isSignalRead(node: MaybeAstNode, context: RuleContext, inEffect: boolean): boolean {
    const call = unwrapNode(node);
    if (!call || call.type !== 'CallExpression' || (Array.isArray(call.arguments) && call.arguments.length > 0)) return false;

    const callee = unwrapNode(call.callee);
    if (!callee) return false;

    if (context.typeChecker) {
        try {
            const sym = getTsSymbolAtNode(callee, context);
            if (sym) {
                const type = context.typeChecker.getTypeOfSymbolAtLocation(sym, sym.valueDeclaration!);
                if (type && context.typeChecker.typeToString(type).includes('Signal')) return true;
            }
        } catch {}
    }

    if (isMemberExpressionLike(callee)) return unwrapNode(callee.object)?.type === 'ThisExpression';
    return inEffect && callee.type === 'Identifier';
}

function analyzeEffect(root: AstNode, context: RuleContext): { hasRead: boolean; hasWrite: boolean; hasAsync: boolean; hasLinked: boolean; firstWrite: AstNode | null } {
    const res = { hasRead: false, hasWrite: false, hasAsync: false, hasLinked: false, firstWrite: null as AstNode | null };
    const stack: AstNode[] = [root];

    while (stack.length) {
        const node = unwrapNode(stack.pop()!);
        if (!node) continue;

        if (node.type === 'AwaitExpression' || node.type === 'YieldExpression') res.hasAsync = true;
        if (node.type === 'CallExpression') {
            const name = getCalleeName(node);
            if (name && ASYNC_METHODS.has(name)) res.hasAsync = true;
            if (name === LINKED_SIGNAL_METHOD) res.hasLinked = true;

            if (isSignalWrite(node)) {
                res.hasWrite = true;
                if (!res.firstWrite) res.firstWrite = node;
            } else if (isSignalRead(node, context, true)) {
                res.hasRead = true;
            }
        }
        for (const child of childNodes(node)) stack.push(child);
    }
    return res;
}

export const signalPreferComputedRule = createCallExpressionRule(
    'signal-prefer-computed-over-sync-effect',
    (node: CallExpression, context: RuleContext): RuleFailure | null => {
        const astNode = node as unknown as AstNode;
        if (!isCalleeNamed(astNode.callee, 'effect')) return null;

        const callback = getCallbackArg(astNode);
        const body = callback ? getFunctionBody(callback) : null;
        if (!body) return null;

        const { hasRead, hasWrite, hasAsync, hasLinked, firstWrite } = analyzeEffect(body, context);
        if (!hasWrite || !hasRead || hasAsync || hasLinked) return null;

        const { line, column } = context.locator.location(getNodeStart(firstWrite || astNode));
        return {
            filePath: context.filePath,
            ruleName: 'signal-prefer-computed-over-sync-effect',
            message: 'Prefer computed() over effect() for synchronous derived state. This effect appears to synchronously read reactive values and write derived state; computed() avoids extra cycles and is easier to reason about.',
            line,
            column,
            severity: 'warn',
            fix: RECOMMENDATIONS['signal-prefer-computed-over-sync-effect'],
        };
    },
    { requires: { typeChecker: true } }
);

