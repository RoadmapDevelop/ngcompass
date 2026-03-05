
// VALID_TEARDOWN_OPERATORS, hasTeardownInPipeCall, and hasTeardownInReceiverChain have been
// moved to rule-utils.ts so rxjs-no-subscribe-in-component can share the same implementation.

import { RuleFailure } from "@ngcompass/common";
import { CallExpression } from "@ngcompass/ast";
import { createCallExpressionRule } from '@ngcompass/engine';
import { RECOMMENDATIONS } from "../recommendations";
import { isSubscribeCall, unwrapNode, isMemberExpressionLike, hasTeardownInReceiverChain, getNodeStart } from "../rule-utils";
import { RuleContext } from "@ngcompass/common";

/**
 * Requires a recognized RxJS teardown operator for `.subscribe(...)` calls in component files.
 */
export const rxjsRequireTakeUntilDestroyedRule = createCallExpressionRule(
    'rxjs-require-takeUntilDestroyed',
    (node: CallExpression, context: RuleContext): RuleFailure | null => {
        if (!context.filePath.endsWith('.component.ts')) return null;
        if (!isSubscribeCall(node as any)) return null;

        const callee = unwrapNode((node as any).callee);
        const receiver = isMemberExpressionLike(callee) ? callee?.object : null;

        const hasTeardown = receiver ? hasTeardownInReceiverChain(receiver) : false;
        if (hasTeardown) return null;

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

