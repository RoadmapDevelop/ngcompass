import { createNewExpressionRule } from '../engine/rule-handler.js';
import type { NewExpression, Identifier, MemberExpression } from '../ast/types.js';
import type { RuleContext, RuleFailure } from '../types.js';
import { RECOMMENDATIONS } from '../recommendations.js';

/**
 * rxjs-avoid-subject-as-event-bus
 * 
 * Detects 'new Subject()' calls inside components.
 * Local event communication should prefer Signals or direct methods for better performance.
 */
export const rxjsAvoidSubjectRule = createNewExpressionRule(
    'rxjs-avoid-subject-as-event-bus',
    (node: NewExpression, context: RuleContext): RuleFailure | null => {
        // High-performance filter: only check .component.ts files
        if (!context.filePath.endsWith('.component.ts')) {
            return null;
        }

        const callee = node.callee;
        let isSubject = false;

        if (callee.type === 'Identifier') {
            isSubject = (callee as Identifier).name === 'Subject';
        } else if (callee.type === 'MemberExpression' || callee.type === 'StaticMemberExpression') {
            const member = callee as MemberExpression;
            if (member.property.name === 'Subject') {
                isSubject = true;
            }
        }

        if (isSubject) {
            const start = node.start ?? node.span?.start ?? 0;
            const { line, column } = context.locator.location(start);

            return {
                filePath: context.filePath,
                ruleName: 'rxjs-avoid-subject-as-event-bus',
                message: 'Avoid using Subject for local event streams in components. Consider Signals or direct handlers.',
                line,
                column,
                severity: 'moderate',
                fix: RECOMMENDATIONS['rxjs-avoid-subject-as-event-bus'],
            };
        }

        return null;
    }
);
