import { createTemplateExpressionRule } from '../engine/rule-handler.js';
import type { TemplateExpressionNode } from '../engine/node-streams.js';
import type { RuleContext, RuleFailure } from '../types.js';
import { RECOMMENDATIONS } from '../recommendations.js';
import {
    type AstNode,
    unwrapNode,
    isMemberExpressionLike,
    getStaticPropertyName,
} from '../rule-utils.js';

/**
 * Per-file state tracking with automatic cleanup.
 * The Map is keyed by template key; entries are cleaned up when a new file is detected.
 */
let _lastFilePath = '';
const seenByTemplateKey = new Map<string, Set<string>>();

function resetIfNewFile(filePath: string): void {
    if (filePath !== _lastFilePath) {
        seenByTemplateKey.clear();
        _lastFilePath = filePath;
    }
}

function getTemplateKey(context: RuleContext): string {
    const templateStartOffset = (context as any).template?.templateStartOffset;
    const offsetPart = typeof templateStartOffset === 'number' && Number.isFinite(templateStartOffset) ? `@${templateStartOffset}` : '@0';
    return `${context.filePath}${offsetPart}`;
}

function getTemplateAbsoluteOffset(context: RuleContext, node: TemplateExpressionNode): number {
    const templateStartOffset = (context as any).template?.templateStartOffset;
    if (typeof templateStartOffset === 'number' && Number.isFinite(templateStartOffset)) {
        return node.sourceSpan.start + templateStartOffset;
    }
    return node.sourceSpan.start;
}

function findAsyncPipedExpression(nodeRaw: AstNode | null | undefined): AstNode | null {
    const node = unwrapNode(nodeRaw);
    if (!node) return null;

    if (node.type === 'BinaryExpression') {
        if (node.operator === '|') {
            const right = unwrapNode(node.right);
            if (right?.type === 'Identifier' && ((right.name as string) ?? '') === 'async') {
                return unwrapNode(node.left);
            }
            return findAsyncPipedExpression(node.left);
        }
    }

    return null;
}

function stringifyExpression(nodeRaw: AstNode | null | undefined, depth = 0): string | null {
    const node = unwrapNode(nodeRaw);
    if (!node) return null;
    if (depth > 6) return null;

    if (node.type === 'Identifier') return (node.name as string) ?? null;
    if (node.type === 'ThisExpression') return 'this';

    if (node.type === 'Literal') {
        if (typeof node.value === 'string') return JSON.stringify(node.value);
        if (typeof node.value === 'number') return String(node.value);
        if (typeof node.value === 'boolean') return node.value ? 'true' : 'false';
        if (node.value === null) return 'null';
        return null;
    }

    if (node.type === 'CallExpression') {
        const calleeStr = stringifyExpression(node.callee, depth + 1);
        if (!calleeStr) return null;
        const args = Array.isArray(node.arguments) ? node.arguments : [];
        const argParts: string[] = [];
        for (const a of args) {
            const s = stringifyExpression(a, depth + 1);
            argParts.push(s ?? '?');
        }
        return `${calleeStr}(${argParts.join(',')})`;
    }

    if (isMemberExpressionLike(node)) {
        const obj = stringifyExpression(node.object, depth + 1);
        const prop = getStaticPropertyName(node);
        if (obj && prop) return `${obj}.${prop}`;
        return null;
    }

    if (node.type === 'UnaryExpression') {
        const arg = stringifyExpression(node.argument, depth + 1);
        if (!arg) return null;
        return `${node.operator}${arg}`;
    }

    if (node.type === 'ConditionalExpression') {
        const t = stringifyExpression(node.test, depth + 1);
        const c = stringifyExpression(node.consequent, depth + 1);
        const a = stringifyExpression(node.alternate, depth + 1);
        if (!t || !c || !a) return null;
        return `${t}?${c}:${a}`;
    }

    return null;
}

function getSeenSetForTemplate(context: RuleContext): Set<string> {
    const key = getTemplateKey(context);
    let set = seenByTemplateKey.get(key);
    if (!set) {
        set = new Set<string>();
        seenByTemplateKey.set(key, set);
    }
    return set;
}

/**
 * Detects repeated `| async` usage on the same observable-like expression within a single template.
 * FIX: Clears state between files to prevent memory leak.
 */
export const templateNoAsyncPipeDuplicationRule = createTemplateExpressionRule(
    'template-no-async-pipe-duplication',
    (node: TemplateExpressionNode, context: RuleContext): RuleFailure | null => {
        // Reset state when processing a new file
        resetIfNewFile(context.filePath);

        const asyncTarget = findAsyncPipedExpression((node as any).expression);
        if (!asyncTarget) return null;

        const observableKey = stringifyExpression(asyncTarget);
        if (!observableKey) return null;

        const seen = getSeenSetForTemplate(context);

        if (seen.has(observableKey)) {
            const offset = getTemplateAbsoluteOffset(context, node);
            const { line, column } = context.locator.location(offset);

            return {
                filePath: context.filePath,
                ruleName: 'template-no-async-pipe-duplication',
                message:
                    `Duplicate async pipe subscription for "${observableKey}". Share it with @if (${observableKey} | async; as v) { ... } or *ngIf="${observableKey} | async as v".`,
                line,
                column,
                severity: 'moderate',
                fix: RECOMMENDATIONS['template-no-async-pipe-duplication'],
            };
        }

        seen.add(observableKey);
        return null;
    },
    {
        requires: { htmlAst: true },
    }
);

/**
 * Exported for testing: resets internal state.
 */
export function _resetAsyncPipeDuplicationState(): void {
    seenByTemplateKey.clear();
    _lastFilePath = '';
}
