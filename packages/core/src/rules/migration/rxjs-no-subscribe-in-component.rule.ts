import { createCallExpressionRule } from '../engine/rule-handler.js';
import type { CallExpression, MemberExpression } from '../ast/types.js';
import type { RuleContext, RuleFailure } from '../types.js';
import { RECOMMENDATIONS } from '../recommendations.js';

/**
 * rxjs-no-subscribe-in-component
 * 
 * Detects .subscribe() calls inside component files.
 * Manual subscriptions are prone to memory leaks and harder to migrate to Signals.
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

        // property is typed as Identifier on MemberExpression, so no .type guard needed
        if (member.property.name === 'subscribe') {
            const start = node.start ?? node.span?.start ?? 0;
            const { line, column } = context.locator.location(start);

            return {
                filePath: context.filePath,
                ruleName: 'rxjs-no-subscribe-in-component',
                message: 'Avoid manual subscriptions in components.',
                line,
                column,
                severity: 'high',
                fix: RECOMMENDATIONS['rxjs-no-subscribe-in-component'],
            };
        }

        return null;
    }
);
