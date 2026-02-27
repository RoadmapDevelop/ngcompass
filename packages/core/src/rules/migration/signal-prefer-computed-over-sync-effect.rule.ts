import { createCallExpressionRule } from '../engine/rule-handler.js';
import type { CallExpression } from '../ast/types.js';
import type { RuleContext, RuleFailure } from '../types.js';
import { RECOMMENDATIONS } from '../recommendations.js';
import {
    type AstNode,
    unwrapNode,
    isMemberExpressionLike,
    getStaticPropertyName,
    getNodeStart,
    isCalleeNamed,
    getCalleeName,
    childNodes,
    getCallbackArg,
    getFunctionBody,
    getTsSymbolAtNode,
} from '../rule-utils.js';

const WRITE_METHODS = new Set(['set', 'update', 'mutate']);

const ASYNC_BOUNDARY_CALLEES = new Set([
    'setTimeout', 'setInterval', 'queueMicrotask', 'requestAnimationFrame',
    'then', 'catch', 'finally', 'subscribe',
]);

// linkedSignal callees - if present, don't suggest computed()
const LINKED_SIGNAL_CALLEES = new Set(['linkedSignal']);

function isSignalWriteCall(callExprRaw: AstNode | null | undefined): boolean {
    const call = unwrapNode(callExprRaw);
    if (!call || call.type !== 'CallExpression') return false;
    const callee = unwrapNode(call.callee);
    if (!isMemberExpressionLike(callee)) return false;
    return WRITE_METHODS.has(getStaticPropertyName(callee));
}

function isLikelySignalRead(nodeRaw: AstNode | null | undefined, context?: RuleContext): boolean {
    const node = unwrapNode(nodeRaw);
    if (!node || node.type !== 'CallExpression') return false;

    // Signal reads are always zero-arg calls
    const args = node.arguments;
    if (Array.isArray(args) && args.length > 0) return false;

    const callee = unwrapNode(node.callee);
    if (!callee) return false;

    // TypeChecker Integration
    if (context?.typeChecker) {
        // We will try to get the symbol or type of the callee to see if it's a Signal
        try {
            const symbol = getTsSymbolAtNode(callee, context);
            if (symbol) {
                // Heuristic: check if the type name includes 'Signal'
                const type = context.typeChecker.getTypeOfSymbolAtLocation(symbol, symbol.valueDeclaration!);
                if (type) {
                    const typeStr = context.typeChecker.typeToString(type);
                    if (typeStr.includes('Signal')) {
                        return true;
                    }
                }
            }
        } catch { }
    }

    // Fallback static heuristics

    // Direct zero-arg call: `count()` - likely a signal read
    if (callee.type === 'Identifier') return true;

    // Member zero-arg call: `this.count()` or `obj.prop()` - likely a signal read
    if (isMemberExpressionLike(callee)) return true;

    return false;
}

type EffectAnalysis = {
    hasLikelySignalRead: boolean;
    hasSignalWrite: boolean;
    hasAsyncBoundary: boolean;
    hasLinkedSignal: boolean;
    firstWriteNode: AstNode | null;
};

function analyzeEffectCallbackBody(root: AstNode, context?: RuleContext): EffectAnalysis {
    const analysis: EffectAnalysis = {
        hasLikelySignalRead: false,
        hasSignalWrite: false,
        hasAsyncBoundary: false,
        hasLinkedSignal: false,
        firstWriteNode: null,
    };

    const stack: AstNode[] = [root];

    while (stack.length) {
        const node = stack.pop()!;
        const n = unwrapNode(node);
        if (!n) continue;

        if (n.type === 'AwaitExpression' || n.type === 'YieldExpression') {
            analysis.hasAsyncBoundary = true;
        }

        if (n.type === 'CallExpression') {
            const calleeName = getCalleeName(n);

            if (calleeName && ASYNC_BOUNDARY_CALLEES.has(calleeName)) {
                analysis.hasAsyncBoundary = true;
            }

            if (calleeName && LINKED_SIGNAL_CALLEES.has(calleeName)) {
                analysis.hasLinkedSignal = true;
            }

            if (isSignalWriteCall(n)) {
                analysis.hasSignalWrite = true;
                if (!analysis.firstWriteNode) analysis.firstWriteNode = n;
            } else if (isLikelySignalRead(n, context)) {
                analysis.hasLikelySignalRead = true;
            }
        }

        for (const child of childNodes(n)) {
            stack.push(child);
        }
    }

    return analysis;
}

/**
 * Suggests replacing certain synchronous derived-state `effect(...)` patterns with `computed(...)`.
 * Improved: Better signal read detection (zero-arg calls only) and linkedSignal awareness.
 */
export const signalPreferComputedRule = createCallExpressionRule(
    'signal-prefer-computed-over-sync-effect',
    (node: CallExpression, context: RuleContext): RuleFailure | null => {
        const call = node as any as AstNode;

        if (!isCalleeNamed(call.callee, 'effect')) return null;

        const callback = getCallbackArg(call);
        if (!callback) return null;

        const body = getFunctionBody(callback);
        if (!body) return null;

        const analysis = analyzeEffectCallbackBody(body, context);

        if (!analysis.hasSignalWrite) return null;
        if (!analysis.hasLikelySignalRead) return null;
        if (analysis.hasAsyncBoundary) return null;
        // Don't suggest computed() when linkedSignal is more appropriate
        if (analysis.hasLinkedSignal) return null;

        const start = analysis.firstWriteNode ? getNodeStart(analysis.firstWriteNode) : getNodeStart(call);
        const { line, column } = context.locator.location(start);

        return {
            filePath: context.filePath,
            ruleName: 'signal-prefer-computed-over-sync-effect',
            message:
                'Prefer computed() over effect() for synchronous derived state. This effect appears to synchronously read reactive values and write derived state; computed() avoids extra cycles and is easier to reason about.',
            line,
            column,
            severity: 'moderate',
            fix: RECOMMENDATIONS['signal-prefer-computed-over-sync-effect'],
        };
    }
);
