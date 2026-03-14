import { RuleFailure } from "@ngcompass/common";
import { CallExpression } from "@ngcompass/ast";
import { createCallExpressionRule } from '@ngcompass/engine';
import { RECOMMENDATIONS, CODE_EXAMPLES } from "../../recommendations";
import {
    AstNode,
    unwrapNode,
    isMemberExpressionLike,
    isSubscribeCall,
    hasTeardownInReceiverChain,
    getNodeStart,
    getStaticPropertyName,
    findObservableSourceCall,
    isLikelyHttpObservable,
} from "../../rule-utils";
import { RuleContext } from "@ngcompass/common";

/**
 * Returns true when a .subscribe() call poses no memory-leak risk because
 * the underlying observable is guaranteed to complete on its own.
 *
 * Two patterns are exempt:
 *
 *  1. Explicit single-emission scope — obs$.pipe(take(1)).subscribe(...)
 *     or obs$.pipe(first()).subscribe(...)
 *     The developer has consciously scoped the stream to one emission.
 *
 *  2. HTTP observable source — this.svc.getUser(id).subscribe(...)
 *     HTTP observables emit exactly once and then complete.  They carry
 *     zero leak risk regardless of whether takeUntilDestroyed is present.
 *     Consistent with the exemption applied in rxjs-require-takeUntilDestroyed.
 *
 * Note: hasTeardownInReceiverChain (takeUntilDestroyed, takeUntil, takeWhile)
 * is handled separately in the rule body — those subscriptions are valid and
 * are suppressed to avoid double-flagging with rxjs-require-takeUntilDestroyed.
 */
function isFireAndForgetSubscription(subscribeNode: AstNode): boolean {
    const callee = unwrapNode((subscribeNode as any).callee);
    if (!isMemberExpressionLike(callee)) return false;

    const receiver = unwrapNode((callee as AstNode).object);
    if (!receiver) return false;

    // Pattern 1: explicit take(1) / first() anywhere in the pipe chain
    if (receiver.type === 'CallExpression') {
        const pipeCallee = unwrapNode((receiver as AstNode).callee);
        if (isMemberExpressionLike(pipeCallee) && getStaticPropertyName(pipeCallee) === 'pipe') {
            const args = Array.isArray((receiver as AstNode).arguments)
                ? (receiver as AstNode).arguments as AstNode[]
                : [];
            const hasTakeOrFirst = args.some(arg => {
                const op = unwrapNode(arg);
                if (!op || op.type !== 'CallExpression') return false;
                const opCallee = unwrapNode(op.callee);
                const name = opCallee?.type === 'Identifier' ? (opCallee.name as string) : '';
                return name === 'take' || name === 'first';
            });
            if (hasTakeOrFirst) return true;
        }
    }

    // Pattern 2: HTTP observable source — auto-completes after one emission.
    // Walks past any .pipe() transforms to find the original source call, then
    // checks for direct HttpClient verbs or service methods with HTTP-action prefixes.
    const sourceCall = findObservableSourceCall(receiver);
    return isLikelyHttpObservable(sourceCall);
}

/**
 * Disallows manual RxJS subscriptions in Angular component files.
 *
 * Allows:
 *   - Fire-and-forget observables (take(1) / first() / HTTP sources) —
 *     they auto-complete and carry no leak risk.
 *   - Subscriptions already guarded by a teardown operator —
 *     rxjs-require-takeUntilDestroyed covers that case; suppressing here
 *     avoids double-flagging developers who have already addressed lifetime.
 *
 * For reactive state derived from observables, use toSignal() or async pipe.
 * For imperative user-triggered actions (save, dialog, navigation), a
 * subscription is acceptable — just ensure it targets an HTTP source or
 * is scoped with takeUntilDestroyed() for long-lived streams.
 */
export const rxjsNoSubscribeInComponentRule = createCallExpressionRule(
    'rxjs-no-subscribe-in-component',
    (node: CallExpression, context: RuleContext): RuleFailure | null => {
        if (!context.filePath.endsWith('.component.ts')) return null;
        if (!isSubscribeCall(node as any)) return null;
        if (isFireAndForgetSubscription(node as any)) return null;

        // Suppress when a full teardown operator is already present —
        // rxjs-require-takeUntilDestroyed covers that case and double-flagging
        // creates noise without additional signal.
        const callee = unwrapNode((node as any).callee);
        const receiver = isMemberExpressionLike(callee) ? (callee as AstNode).object : null;
        if (receiver && hasTeardownInReceiverChain(receiver as AstNode)) return null;

        const start = getNodeStart(node as any);
        const { line, column } = context.locator.location(start);

        // CTX-008: When CrossRef data is available, extract the stream property name from the
        // receiver chain (e.g. `this.users$.subscribe(…)` → `users$`) and check if that
        // property is actually consumed in the template.  If it IS a template-bound observable,
        // we surface a targeted "use toSignal()" message instead of the generic advisory.
        // Falls back to the generic message when CrossRef is unavailable.
        let message =
            'Avoid open-ended subscriptions in components. Use toSignal() for reactive state, or scope long-lived streams with takeUntilDestroyed(). HTTP calls that auto-complete are exempt.';

        const templateRefs = context.crossRef?.templateReferences;
        if (templateRefs !== undefined) {
            // Dig into `<receiver>.subscribe(…)` to find the immediate property name.
            // Works for both `this.users$.subscribe(…)` and `this.service.data$.subscribe(…)`.
            const subscribeCallee = unwrapNode((node as any).callee);
            if (isMemberExpressionLike(subscribeCallee)) {
                const receiver = unwrapNode((subscribeCallee as AstNode).object);
                if (receiver) {
                    const propName = getStaticPropertyName(receiver);
                    if (propName) {
                        const baseName = propName.endsWith('$') ? propName.slice(0, -1) : propName;
                        if (templateRefs.has(propName) || templateRefs.has(baseName)) {
                            message =
                                `'${propName}' is consumed in the template. Replace this subscription with ` +
                                `toSignal(${propName}) and bind the resulting signal directly — no manual subscription needed.`;
                        }
                    }
                }
            }
        }

        return {
            filePath: context.filePath,
            ruleName: 'rxjs-no-subscribe-in-component',
            message,
            line,
            column,
            severity: 'error',
            fix: RECOMMENDATIONS['rxjs-no-subscribe-in-component'],
            codeExample: CODE_EXAMPLES['rxjs-no-subscribe-in-component'],
        };
    },
    { requires: { projectContext: true } }
);
