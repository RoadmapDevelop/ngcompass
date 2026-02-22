import { createCallExpressionRule } from '../engine/rule-handler.js';
import type { CallExpression, MemberExpression } from '../ast/types.js';
import type { RuleContext, RuleFailure } from '../types.js';
import { RECOMMENDATIONS } from '../recommendations.js';

/**
 * Teardown operators that indicate responsible subscription management.
 * When these are present, rxjs-require-takeUntilDestroyed handles the violation.
 * This rule stays silent to avoid double-reporting the same line.
 */
const VALID_TEARDOWN_OPERATORS = new Set([
    'takeUntilDestroyed',
    'takeUntil',
    'take',
    'first',
    'takeWhile',
]);

/**
 * rxjs-no-subscribe-in-component
 *
 * Detects .subscribe() calls inside component files.
 * Manual subscriptions are prone to memory leaks and harder to migrate to Signals.
 *
 * Note: If a teardown operator is already present in the pipe chain, this rule
 * stays silent — rxjs-require-takeUntilDestroyed already handles that case.
 * The recommended path is to eliminate manual subscriptions entirely via
 * toSignal() or the async pipe.
 */
export const rxjsNoSubscribeInComponentRule = createCallExpressionRule(
    'rxjs-no-subscribe-in-component',
    (node: CallExpression, context: RuleContext): RuleFailure | null => {
        // High-performance filter: only check .component.ts files
        if (!context.filePath.endsWith('.component.ts')) return null;

        const callee = node.callee;
        // .subscribe() is always a static member access — skip computed calls like obj['subscribe']()
        if (callee.type !== 'StaticMemberExpression' && callee.type !== 'MemberExpression') return null;

        const member = callee as MemberExpression;
        if (member.property.name !== 'subscribe') return null;

        // Check if the observable already has a teardown operator in the pipe chain.
        // If so, stay silent — rxjs-require-takeUntilDestroyed handles that report.
        // We only report when there is NO teardown at all (the worst case scenario).
        const observable = member.object;
        if (observable.type === 'CallExpression') {
            const obsCall = observable as CallExpression;
            const obsCallee = obsCall.callee;
            if ((obsCallee.type === 'MemberExpression' || obsCallee.type === 'StaticMemberExpression') &&
                (obsCallee as MemberExpression).property.name === 'pipe') {
                for (const arg of obsCall.arguments) {
                    if (arg.type === 'CallExpression') {
                        const opCallee = (arg as CallExpression).callee;
                        if (opCallee.type === 'Identifier' && VALID_TEARDOWN_OPERATORS.has((opCallee as any).name)) {
                            return null; // Has teardown — let rxjs-require-takeUntilDestroyed report
                        }
                        if ((opCallee.type === 'MemberExpression' || opCallee.type === 'StaticMemberExpression') &&
                            VALID_TEARDOWN_OPERATORS.has((opCallee as any).property?.name)) {
                            return null; // Has teardown — let rxjs-require-takeUntilDestroyed report
                        }
                    }
                }
            }
        }

        const start = node.start ?? node.span?.start ?? 0;
        const { line, column } = context.locator.location(start);

        return {
            filePath: context.filePath,
            ruleName: 'rxjs-no-subscribe-in-component',
            message: 'Avoid manual subscriptions in components. Prefer toSignal() or the async pipe for automatic teardown and better performance.',
            line,
            column,
            severity: 'high',
            fix: RECOMMENDATIONS['rxjs-no-subscribe-in-component'],
        };
    }
);
