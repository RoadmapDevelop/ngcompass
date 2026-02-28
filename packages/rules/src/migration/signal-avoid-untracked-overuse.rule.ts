import { RuleFailure } from "@ngcompass/common";
import { CallExpression } from "@ngcompass/ast";
import { createCallExpressionRule } from "../engine/rule-handler";
import { RECOMMENDATIONS } from "../recommendations";
import { AstNode, getCalleeName, getNodeStart, isCalleeNamed } from "../rule-utils";
import { RuleContext } from "@ngcompass/common";


/** Names of Angular render-lifecycle hooks where untracked() usage is idiomatic. */
const RENDER_HOOK_NAMES = new Set(['afterRender', 'afterNextRender']);

/**
 * Number of source characters to inspect before an untracked() call when AST parent
 * pointers are unavailable. Large enough to capture typical callback wrappers.
 *
 * Why 500: covers a complete afterRender(() => { ... }) callback preamble in
 * normal formatting without scanning an excessive portion of the file.
 */
const PRECEDING_CONTEXT_CHARS = 500;

/** Regex that matches the opening of any render-hook call. Compiled once at module load. */
const RENDER_HOOK_OPEN_PATTERN = /\bafterNextRender\s*\(|\bafterRender\s*\(/;

/**
 * Fast-path check: returns false immediately when the file contains no render hooks,
 * avoiding the per-call parent walk or source scan entirely.
 */
function fileContainsRenderHooks(sourceText: string | undefined): boolean {
    return typeof sourceText === 'string' && RENDER_HOOK_OPEN_PATTERN.test(sourceText);
}

/**
 * Walks AST parent pointers to determine whether a node is nested inside a render-hook callback.
 * Returns true/false when parent refs are available, or null when they are absent.
 */
function isInsideRenderHookViaParents(node: AstNode): boolean | null {
    let current = (node as any).parent as AstNode | undefined;
    if (!current) return null;

    while (current) {
        if (current.type === 'CallExpression' && RENDER_HOOK_NAMES.has(getCalleeName(current))) {
            return true;
        }
        current = (current as any).parent as AstNode | undefined;
    }

    return false;
}

/**
 * Positional fallback: checks whether a render hook appears in the source text
 * immediately before this node, used when AST parent pointers are unavailable.
 */
function isInsideRenderHookByPosition(node: AstNode, sourceText: string): boolean {
    const nodeStart = getNodeStart(node);
    const precedingText = sourceText.substring(Math.max(0, nodeStart - PRECEDING_CONTEXT_CHARS), nodeStart);
    return RENDER_HOOK_OPEN_PATTERN.test(precedingText);
}

/**
 * Determines whether an untracked() call is inside a render-hook callback.
 * Tries parent-pointer walk first; falls back to positional source scan.
 */
function isInsideRenderHookCallback(node: AstNode, context: RuleContext): boolean {
    const sourceText: string | undefined = (context as any).sourceText ?? context.fileContent;

    // Fast path: if the file has no render hooks at all, skip all further checks
    if (!fileContainsRenderHooks(sourceText)) return false;

    const parentWalkResult = isInsideRenderHookViaParents(node);
    if (parentWalkResult !== null) return parentWalkResult;

    // Parent refs missing — fall back to positional heuristic
    return typeof sourceText === 'string' && isInsideRenderHookByPosition(node, sourceText);
}

/**
 * Surfaces calls to `untracked(...)` as a low-severity advisory.
 *
 * Suppresses the warning when the call is inside an `afterRender()` or
 * `afterNextRender()` callback, where untracked() usage is idiomatic.
 */
export const signalAvoidUntrackedRule = createCallExpressionRule(
    'signal-avoid-untracked-overuse',
    (node: CallExpression, context: RuleContext): RuleFailure | null => {
        if (!isCalleeNamed((node as any).callee, 'untracked')) return null;
        if (isInsideRenderHookCallback(node as any, context)) return null;

        const start = getNodeStart(node as any);
        const { line, column } = context.locator.location(start);

        return {
            filePath: context.filePath,
            ruleName: 'signal-avoid-untracked-overuse',
            message:
                'Review this untracked() call. Each usage intentionally opts out of reactive tracking—ensure it is deliberate and necessary to avoid masking dependency bugs.',
            line,
            column,
            severity: 'low',
            fix: RECOMMENDATIONS['signal-avoid-untracked-overuse'],
        };
    }
);

