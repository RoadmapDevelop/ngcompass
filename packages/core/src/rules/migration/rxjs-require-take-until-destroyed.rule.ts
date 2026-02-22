import { createCallExpressionRule } from '../engine/rule-handler.js';
import type { CallExpression, MemberExpression } from '../ast/types.js';
import type { RuleContext, RuleFailure } from '../types.js';
import { RECOMMENDATIONS } from '../recommendations.js';

/**
 * rxjs-require-takeUntilDestroyed
 * 
 * Detects .subscribe() calls that don't have a takeUntilDestroyed() operator.
 * This is the most common cause of memory leaks in legacy Angular apps.
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
        // Now check if the object we are calling .subscribe() on is a .pipe() call containing takeUntilDestroyed
        const observable = member.object;
        let hasTeardown = false;

        if (observable.type === 'CallExpression') {
            const obsCall = observable as CallExpression;
            const obsCallee = obsCall.callee;

            if (obsCallee.type === 'MemberExpression' || obsCallee.type === 'StaticMemberExpression') {
                const obsMember = obsCallee as MemberExpression;

                // If it's .pipe(...)
                if (obsMember.property.name === 'pipe') {
                    const pipeArgs = obsCall.arguments;
                    for (const arg of pipeArgs) {
                        if (arg.type === 'CallExpression') {
                            const operatorCall = arg as CallExpression;
                            const opCallee = operatorCall.callee;

                            if (opCallee.type === 'Identifier' && (opCallee as any).name === 'takeUntilDestroyed') {
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
                message: 'Subscriptions in components must use takeUntilDestroyed() to prevent leaks.',
                line,
                column,
                severity: 'high',
                fix: RECOMMENDATIONS['rxjs-require-takeUntilDestroyed'],
            };
        }

        return null;
    }
);
