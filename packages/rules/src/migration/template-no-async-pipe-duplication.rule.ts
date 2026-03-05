import { TemplateExpressionNode } from "@ngcompass/ast";
import { RuleFailure } from "@ngcompass/common";
import { createTemplateExpressionRule } from '@ngcompass/engine';
import { RECOMMENDATIONS } from "../recommendations";
import { AstNode, unwrapNode, isMemberExpressionLike, getStaticPropertyName, getTemplateAbsoluteOffset } from "../rule-utils";
import { RuleContext } from "@ngcompass/common";


// ============================================================================
// Per-context state — scoped to RuleContext via WeakMap so each analysis
// run gets its own isolated tracking table.
//
// WHY WeakMap: Module-level Maps (the previous design) are shared across
// all invocations in the same worker thread module instance. Two sequential
// files could bleed state if the file-change detection logic ever fails.
// WeakMap keys are the RuleContext object, which is created fresh per file
// per batch, so GC automatically reclaims the sets when the context is dropped.
// ============================================================================
const seenByTemplateKey = new WeakMap<RuleContext, Map<string, Set<string>>>();

/**
 * Returns (or creates) the template-key > seen-expressions map for a context.
 */
function getContextState(context: RuleContext): Map<string, Set<string>> {
    let state = seenByTemplateKey.get(context);
    if (!state) {
        state = new Map<string, Set<string>>();
        seenByTemplateKey.set(context, state);
    }
    return state;
}

function getTemplateKey(context: RuleContext): string {
    const templateStartOffset = (context as unknown as { template?: { templateStartOffset?: number } }).template?.templateStartOffset;
    const offsetPart = typeof templateStartOffset === 'number' && Number.isFinite(templateStartOffset) ? `@${templateStartOffset}` : '@0';
    return `${context.filePath}${offsetPart}`;
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
    const state = getContextState(context);
    const key = getTemplateKey(context);
    let set = state.get(key);
    if (!set) {
        set = new Set<string>();
        state.set(key, set);
    }
    return set;
}

/**
 * Detects repeated `| async` usage on the same observable-like expression within a single template.
 *
 * State is scoped to the RuleContext instance (via WeakMap) so each file's analysis run
 * gets its own isolated tracking table. No module-level mutable state is used.
 */
export const templateNoAsyncPipeDuplicationRule = createTemplateExpressionRule(
    'template-no-async-pipe-duplication',
    (node: TemplateExpressionNode, context: RuleContext): RuleFailure | null => {
        const asyncTarget = findAsyncPipedExpression(node.expression as unknown as AstNode);
        if (!asyncTarget) return null;

        const observableKey = stringifyExpression(asyncTarget);
        if (!observableKey) return null;

        const seen = getSeenSetForTemplate(context);

        if (seen.has(observableKey)) {
            const offset = getTemplateAbsoluteOffset(context as unknown as { template?: { templateStartOffset?: number } }, node.sourceSpan.start);
            const { line, column } = context.locator.location(offset);

            return {
                filePath: context.filePath,
                ruleName: 'template-no-async-pipe-duplication',
                message:
                    `Duplicate async pipe subscription for "${observableKey}". Share it with @if (${observableKey} | async; as v) { ... } or *ngIf="${observableKey} | async as v".`,
                line,
                column,
                severity: 'warn',
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

