
// VALID_TEARDOWN_OPERATORS, hasTeardownInPipeCall, and hasTeardownInReceiverChain have been
// moved to rule-utils.ts so rxjs-no-subscribe-in-component can share the same implementation.

import { RuleFailure } from "@ngcompass/common";
import { CallExpression } from "@ngcompass/ast";
import { createCallExpressionRule } from '@ngcompass/engine';
import { RECOMMENDATIONS } from "../../recommendations";
import { isSubscribeCall, unwrapNode, isMemberExpressionLike, hasTeardownInReceiverChain, getNodeStart, findObservableSourceCall, isLikelyHttpObservable } from "../../rule-utils";
import { RuleContext } from "@ngcompass/common";

/**
 * RULE-ACC-009: Detects the `ngOnDestroy` + `.unsubscribe()` manual teardown pattern.
 *
 * Some Angular components manage subscription lifecycle by storing a `Subscription`
 * reference and calling `.unsubscribe()` inside `ngOnDestroy()`.  This is a valid,
 * pre-`takeUntilDestroyed` pattern and should not be flagged as a leak risk.
 *
 * The check is file-level (not scope-aware), which is intentional: if a component
 * has both `ngOnDestroy` and `.unsubscribe()`, it is almost certainly using this
 * pattern for at least some of its subscriptions.  The heuristic trades a small
 * risk of false negatives for a significant reduction in false positives.
 *
 * Cached per-file path to avoid re-scanning on every CallExpression node.
 */
const fileManualTeardownCache = new Map<string, boolean>();

// Evict all entries once the cache exceeds this limit to prevent unbounded
// growth in long-running watch/LSP server modes.  CLI runs are single-shot
// and exit immediately, so they are unaffected by the eviction threshold.
const TEARDOWN_CACHE_MAX = 500;

function fileHasManualTeardown(filePath: string, fileContent: string): boolean {
    const cached = fileManualTeardownCache.get(filePath);
    if (cached !== undefined) return cached;

    const hasNgOnDestroy = /\bngOnDestroy\b/.test(fileContent);
    const hasUnsubscribeCall = /\.unsubscribe\(\)/.test(fileContent);
    const result = hasNgOnDestroy && hasUnsubscribeCall;

    if (fileManualTeardownCache.size >= TEARDOWN_CACHE_MAX) fileManualTeardownCache.clear();
    fileManualTeardownCache.set(filePath, result);
    return result;
}

/**
 * Requires a recognized RxJS teardown operator for `.subscribe(...)` calls in component files.
 *
 * RULE-ACC-009: Skips the rule when the component already uses the `ngOnDestroy` +
 * `.unsubscribe()` manual teardown pattern, which is a valid alternative to
 * `takeUntilDestroyed` / `takeUntil` for subscription cleanup.
 */
export const rxjsRequireTakeUntilDestroyedRule = createCallExpressionRule(
    'rxjs-require-takeUntilDestroyed',
    (node: CallExpression, context: RuleContext): RuleFailure | null => {
        if (!context.filePath.endsWith('.component.ts')) return null;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (!isSubscribeCall(node as any)) return null;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const callee = unwrapNode((node as any).callee);
        const receiver = isMemberExpressionLike(callee) ? callee?.object : null;

        const hasTeardown = receiver ? hasTeardownInReceiverChain(receiver) : false;
        if (hasTeardown) return null;

        // Skip auto-completing HTTP observables — they emit once and complete, so they carry
        // no subscription-leak risk and do not need takeUntilDestroyed.
        // Example: this.userSvc.getUser(id).subscribe(...) is fire-and-forget.
        const sourceCall = findObservableSourceCall(receiver);
        if (isLikelyHttpObservable(sourceCall)) return null;

        // RULE-ACC-009: Accept the ngOnDestroy + .unsubscribe() manual teardown pattern.
        // If the file has both lifecycle hook and an unsubscribe call, treat the
        // subscriptions as managed and skip this rule.
        if (fileHasManualTeardown(context.filePath, context.fileContent)) return null;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const start = getNodeStart(node as any);
        const { line, column } = context.locator.location(start);

        return {
            filePath: context.filePath,
            ruleName: 'rxjs-require-takeUntilDestroyed',
            message:
                'Subscriptions in components must include a teardown operator in the subscribe chain (takeUntilDestroyed, takeUntil, take, first, takeWhile) to reduce leak risk.',
            line,
            column,
            severity: 'error',
            fix: RECOMMENDATIONS['rxjs-require-takeUntilDestroyed'],
        };
    }
);

