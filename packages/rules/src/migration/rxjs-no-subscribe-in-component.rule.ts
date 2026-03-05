import { RuleFailure } from "@ngcompass/common";
import { CallExpression } from "@ngcompass/ast";
import { createCallExpressionRule } from '@ngcompass/engine';
import { RECOMMENDATIONS, CODE_EXAMPLES } from "../recommendations";
import { AstNode, unwrapNode, isMemberExpressionLike, isSubscribeCall, hasTeardownInReceiverChain, getNodeStart } from "../rule-utils";
import { RuleContext } from "@ngcompass/common";

/**
 * Returns true for subscriptions that auto-complete and therefore cannot leak memory
 * (e.g. HTTP calls piped with take(1) or first()).
 *
 * This is intentionally narrower than hasTeardownInReceiverChain: fire-and-forget
 * observables complete on their own and are a legitimate subscribe pattern.
 */
function isFireAndForgetSubscription(subscribeNode: AstNode): boolean {
    const callee = unwrapNode((subscribeNode as any).callee);
    if (!isMemberExpressionLike(callee)) return false;

    const receiver = unwrapNode((callee as any).object);
    if (!receiver || receiver.type !== 'CallExpression') return false;

    // Must be piped immediately before subscribe
    const pipeCallee = unwrapNode(receiver.callee);
    if (!isMemberExpressionLike(pipeCallee) || (pipeCallee as AstNode).property?.['name'] !== 'pipe') return false;

    const args = receiver.arguments;
    if (!Array.isArray(args)) return false;

    // Only take(1) and first() guarantee the observable completes (fire-and-forget)
    return args.some(arg => {
        const op = unwrapNode(arg);
        if (!op || op.type !== 'CallExpression') return false;
        const calleeName = (unwrapNode(op.callee) as AstNode)?.name as string;
        return calleeName === 'take' || calleeName === 'first';
    });
}

/**
 * Disallows manual RxJS subscriptions in Angular component files.
 *
 * Allows:
 *   - Fire-and-forget streams (take(1) / first()) — they auto-complete, no leak risk.
 *   - Subscriptions with a full teardown operator — already handled by the
 *     rxjs-require-takeUntilDestroyed rule; suppressing here avoids double-flagging
 *     developers who have already addressed lifetime management.
 */
export const rxjsNoSubscribeInComponentRule = createCallExpressionRule(
    'rxjs-no-subscribe-in-component',
    (node: CallExpression, context: RuleContext): RuleFailure | null => {
        if (!context.filePath.endsWith('.component.ts')) return null;
        if (!isSubscribeCall(node as any)) return null;
        if (isFireAndForgetSubscription(node as any)) return null;

        // Suppress when a full teardown operator is already present — rxjs-require-takeUntilDestroyed
        // covers that case and double-flagging creates noise without additional signal.
        const callee = unwrapNode((node as any).callee);
        const receiver = isMemberExpressionLike(callee) ? (callee as AstNode).object : null;
        if (receiver && hasTeardownInReceiverChain(receiver as AstNode)) return null;

        const start = getNodeStart(node as any);
        const { line, column } = context.locator.location(start);

        return {
            filePath: context.filePath,
            ruleName: 'rxjs-no-subscribe-in-component',
            message:
                'Avoid manual subscriptions in components. Prefer toSignal() or the async pipe for automatic teardown and better performance.',
            line,
            column,
            severity: 'error',
            fix: RECOMMENDATIONS['rxjs-no-subscribe-in-component'],
            codeExample: CODE_EXAMPLES['rxjs-no-subscribe-in-component'],
        };
    }
);

