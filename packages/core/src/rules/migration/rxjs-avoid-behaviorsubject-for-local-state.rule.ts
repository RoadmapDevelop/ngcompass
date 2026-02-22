import { createNewExpressionRule } from '../engine/rule-handler.js';
import type { NewExpression, Identifier, MemberExpression } from '../ast/types.js';
import type { RuleContext, RuleFailure } from '../types.js';
import { RECOMMENDATIONS } from '../recommendations.js';

/**
 * rxjs-avoid-behaviorsubject-for-local-state
 * 
 * Detects 'new BehaviorSubject()' calls inside components and services.
 * Local state should prefer Signals for better performance and simpler reactivity.
 */
export const rxjsAvoidBehaviorSubjectRule = createNewExpressionRule(
    'rxjs-avoid-behaviorsubject-for-local-state',
    (node: NewExpression, context: RuleContext): RuleFailure | null => {
        // High-performance filter: only check .component.ts and .service.ts files
        if (!context.filePath.endsWith('.component.ts') && !context.filePath.endsWith('.service.ts')) {
            return null;
        }

        const callee = node.callee;
        let isBehaviorSubject = false;

        if (callee.type === 'Identifier') {
            isBehaviorSubject = (callee as Identifier).name === 'BehaviorSubject';
        } else if (callee.type === 'MemberExpression' || callee.type === 'StaticMemberExpression') {
            const member = callee as MemberExpression;
            if (member.property.name === 'BehaviorSubject') {
                isBehaviorSubject = true;
            }
        }

        if (isBehaviorSubject) {
            const start = node.start ?? node.span?.start ?? 0;
            const { line, column } = context.locator.location(start);

            return {
                filePath: context.filePath,
                ruleName: 'rxjs-avoid-behaviorsubject-for-local-state',
                message: 'Avoid using BehaviorSubject for local state. Prefer Signals for better performance and simplicity.',
                line,
                column,
                severity: 'moderate',
                fix: RECOMMENDATIONS['rxjs-avoid-behaviorsubject-for-local-state'],
            };
        }

        return null;
    }
);
