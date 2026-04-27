import { RuleFailure, RuleContext } from "@ngcompass/common";
import { CallExpression } from "@ngcompass/ast";
import { createCallExpressionRule } from '@ngcompass/engine';
import { RECOMMENDATIONS } from "../../recommendations";
import { AstNode, getCalleeName, getNodeStart, isCalleeNamed, childNodes, unwrapNode } from "../../rule-utils";

const RENDER_HOOKS = new Set(['afterRender', 'afterNextRender']);
const RENDER_HOOK_PATTERN = /\bafterNextRender\s*\(|\bafterRender\s*\(/;

const rangeCache = new Map<string, ReadonlyArray<readonly [number, number]>>();
const CACHE_LIMIT = 300;

function getNodeEnd(node: AstNode): number {
    return (node.end as number) ?? (node.span?.end as number) ?? getNodeStart(node);
}

function collectRanges(program: AstNode): ReadonlyArray<readonly [number, number]> {
    const ranges: [number, number][] = [];
    const stack: AstNode[] = Array.isArray((program as any).body) ? [...(program as any).body] : [program];

    while (stack.length) {
        const node = unwrapNode(stack.pop()!);
        if (!node) continue;

        if (node.type === 'CallExpression' && RENDER_HOOKS.has(getCalleeName(node))) {
            const callback = unwrapNode((node.arguments as any)?.[0]);
            if (callback) {
                const start = getNodeStart(callback);
                const end = getNodeEnd(callback);
                if (end > start) ranges.push([start, end]);
            }
        }
        for (const child of childNodes(node)) stack.push(child);
    }
    return ranges;
}

function getRanges(context: RuleContext): ReadonlyArray<readonly [number, number]> {
    let ranges = rangeCache.get(context.filePath);
    if (ranges !== undefined) return ranges;

    const program = (context as any).program;
    ranges = program ? collectRanges(program) : [];
    if (rangeCache.size >= CACHE_LIMIT) rangeCache.clear();
    rangeCache.set(context.filePath, ranges);
    return ranges;
}

function isInsideHook(node: AstNode, context: RuleContext): boolean {
    const text = (context as any).sourceText ?? context.fileContent;
    if (typeof text === 'string' && !RENDER_HOOK_PATTERN.test(text)) return false;

    let parent = node.parent;
    while (parent) {
        if (parent.type === 'CallExpression' && RENDER_HOOKS.has(getCalleeName(parent))) return true;
        parent = parent.parent;
    }

    const start = getNodeStart(node);
    return getRanges(context).some(([s, e]) => start >= s && start < e);
}

export const signalAvoidUntrackedRule = createCallExpressionRule(
    'signal-avoid-untracked-overuse',
    (node: CallExpression, context: RuleContext): RuleFailure | null => {
        const astNode = node as unknown as AstNode;
        if (!isCalleeNamed(astNode.callee, 'untracked') || isInsideHook(astNode, context)) return null;

        const { line, column } = context.locator.location(getNodeStart(astNode));
        return {
            filePath: context.filePath,
            ruleName: 'signal-avoid-untracked-overuse',
            message: 'Review this untracked() call. Each usage intentionally opts out of reactive tracking—ensure it is deliberate and necessary to avoid masking dependency bugs.',
            line,
            column,
            severity: 'warn',
            fix: RECOMMENDATIONS['signal-avoid-untracked-overuse'],
        };
    }
);


