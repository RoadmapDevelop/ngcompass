import { createCallExpressionRule } from '../engine/rule-handler.js';
import type { CallExpression } from '../ast/types.js';
import type { RuleContext, RuleFailure } from '../types.js';
import { RECOMMENDATIONS } from '../recommendations.js';

/**
 * signal-avoid-untracked-overuse
 * 
 * Flags usage of untracked().
 * While sometimes necessary, overusing untracked() makes code harder to reason about 
 * and can hide reactive bugs.
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
                message: 'Avoid overusing untracked(). It breaks the reactive dependency chain and can mask logic errors.',
                line,
                column,
                severity: 'low',
                fix: RECOMMENDATIONS['signal-avoid-untracked-overuse'],
            };
        }

        return null;
    }
);
