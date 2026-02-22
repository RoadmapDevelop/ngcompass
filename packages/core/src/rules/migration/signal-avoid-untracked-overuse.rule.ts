import { createCallExpressionRule } from '../engine/rule-handler.js';
import type { CallExpression } from '../ast/types.js';
import type { RuleContext, RuleFailure } from '../types.js';
import { RECOMMENDATIONS } from '../recommendations.js';

/**
 * signal-avoid-untracked-overuse
 *
 * Flags every usage of untracked() as an advisory notice.
 *
 * untracked() is a valid Angular primitive, but each usage is a deliberate
 * opt-out from reactive dependency tracking. This rule surfaces each call
 * so that developers can review whether the opt-out is intentional and
 * necessary — preventing accidental dependency silencing that hides bugs.
 *
 * Severity is 'low' because untracked() IS sometimes necessary (e.g., reading
 * a signal inside an effect without subscribing to its changes). The goal is
 * awareness, not prohibition.
 */
export const signalAvoidUntrackedRule = createCallExpressionRule(
    'signal-avoid-untracked-overuse',
    (node: CallExpression, context: RuleContext): RuleFailure | null => {
        const callee = node.callee;

        let isUntracked = false;
        if (callee.type === 'Identifier') {
            isUntracked = (callee as any).name === 'untracked';
        } else if (callee.type === 'MemberExpression' || callee.type === 'StaticMemberExpression') {
            const member = callee as any;
            if (member.property && member.property.name === 'untracked') {
                isUntracked = true;
            }
        }

        if (isUntracked) {
            const start = node.start ?? node.span?.start ?? 0;
            const { line, column } = context.locator.location(start);

            return {
                filePath: context.filePath,
                ruleName: 'signal-avoid-untracked-overuse',
                message: 'Review this untracked() call. Each usage intentionally opts out of reactive tracking — ensure this is deliberate and necessary to avoid masking reactive dependency bugs.',
                line,
                column,
                severity: 'low',
                fix: RECOMMENDATIONS['signal-avoid-untracked-overuse'],
            };
        }

        return null;
    }
);
