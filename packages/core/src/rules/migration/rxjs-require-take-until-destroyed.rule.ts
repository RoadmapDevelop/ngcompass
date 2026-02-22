import { createCallExpressionRule } from '../engine/rule-handler.js';
import type { CallExpression, MemberExpression } from '../ast/types.js';
import type { RuleContext, RuleFailure } from '../types.js';
import { RECOMMENDATIONS } from '../recommendations.js';

/**
 * Valid teardown operators that prevent memory leaks in RxJS subscriptions.
 * All of these guarantee the subscription completes, either by lifecycle scoping
 * or by completing after a fixed number of emissions.
 */
const VALID_TEARDOWN_OPERATORS = new Set([
    'takeUntilDestroyed', // Angular's preferred lifecycle-scoped teardown
    'takeUntil',          // Manual subject-based teardown
    'take',               // Fixed emission count teardown
    'first',              // Completes after first emission
    'takeWhile',          // Condition-based teardown
]);

/**
 * rxjs-require-takeUntilDestroyed
 *
 * Detects .subscribe() calls that don't have a recognized teardown operator.
 * Accepts takeUntilDestroyed (preferred), takeUntil, take, first, and takeWhile
 * as valid alternatives to prevent memory leaks.
 */
export const rxjsRequireTakeUntilDestroyedRule = createCallExpressionRule(
    'rxjs-require-takeUntilDestroyed',
    (node: CallExpression, context: RuleContext): RuleFailure | null => {
        if (!context.filePath.endsWith('.component.ts')) return null;

        const callee = node.callee;
        if (callee.type !== 'MemberExpression' && callee.type !== 'StaticMemberExpression') return null;

        const member = callee as MemberExpression;
        if (member.property.name !== 'subscribe') return null;

        // We found a .subscribe() call.
        // Now check if the observable is piped with a recognized teardown operator.
        const observable = member.object;
        let hasTeardown = false;

        if (observable.type === 'CallExpression') {
            const obsCall = observable as CallExpression;
            const obsCallee = obsCall.callee;

            if (obsCallee.type === 'MemberExpression' || obsCallee.type === 'StaticMemberExpression') {
                const obsMember = obsCallee as MemberExpression;

                if (obsMember.property.name === 'pipe') {
                    const pipeArgs = obsCall.arguments;
                    for (const arg of pipeArgs) {
                        if (arg.type === 'CallExpression') {
                            const operatorCall = arg as CallExpression;
                            const opCallee = operatorCall.callee;

                            // Check for bare operator: takeUntilDestroyed(), take(1), first(), etc.
                            if (opCallee.type === 'Identifier' && VALID_TEARDOWN_OPERATORS.has((opCallee as any).name)) {
                                hasTeardown = true;
                                break;
                            }

                            // Check for namespaced operator: rxjs.takeUntilDestroyed(), etc.
                            if ((opCallee.type === 'MemberExpression' || opCallee.type === 'StaticMemberExpression') &&
                                VALID_TEARDOWN_OPERATORS.has((opCallee as any).property?.name)) {
                                hasTeardown = true;
                                break;
                            }
                        }
                    }
                }
            }
        }

        if (!hasTeardown) {
            const start = node.start ?? node.span?.start ?? 0;
            const { line, column } = context.locator.location(start);

            return {
                filePath: context.filePath,
                ruleName: 'rxjs-require-takeUntilDestroyed',
                message: 'Subscriptions in components must use a teardown operator (takeUntilDestroyed, takeUntil, take, first, takeWhile) to prevent memory leaks.',
                line,
                column,
                severity: 'high',
                fix: RECOMMENDATIONS['rxjs-require-takeUntilDestroyed'],
            };
        }

        return null;
    }
);
