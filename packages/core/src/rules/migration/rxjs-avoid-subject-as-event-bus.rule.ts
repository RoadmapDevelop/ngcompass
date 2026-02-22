import { createNewExpressionRule } from '../engine/rule-handler.js';
import type { NewExpression, Identifier, MemberExpression } from '../ast/types.js';
import type { RuleContext, RuleFailure } from '../types.js';
import { RECOMMENDATIONS } from '../recommendations.js';

/**
 * Subject types that represent event-bus / hot-stream patterns in components.
 * All are flagged because they introduce unnecessary RxJS complexity
 * for local component state that Signals can handle more cleanly.
 */
const SUBJECT_TYPES = new Set(['Subject', 'ReplaySubject', 'AsyncSubject']);

/**
 * rxjs-avoid-subject-as-event-bus
 *
 * Detects 'new Subject()', 'new ReplaySubject()', and 'new AsyncSubject()' calls
 * inside components. Local event communication should prefer Signals or direct
 * methods for better performance and simpler lifecycle management.
 */
export const rxjsAvoidSubjectRule = createNewExpressionRule(
    'rxjs-avoid-subject-as-event-bus',
    (node: NewExpression, context: RuleContext): RuleFailure | null => {
        // High-performance filter: only check .component.ts files
        if (!context.filePath.endsWith('.component.ts')) {
            return null;
        }

        const callee = node.callee;
        let detectedType: string | null = null;

        if (callee.type === 'Identifier') {
            const name = (callee as Identifier).name;
            if (SUBJECT_TYPES.has(name)) detectedType = name;
        } else if (callee.type === 'MemberExpression' || callee.type === 'StaticMemberExpression') {
            const member = callee as MemberExpression;
            const propName = (member.property as any)?.name;
            if (propName && SUBJECT_TYPES.has(propName)) detectedType = propName;
        }

        if (detectedType) {
            const start = node.start ?? node.span?.start ?? 0;
            const { line, column } = context.locator.location(start);

            return {
                filePath: context.filePath,
                ruleName: 'rxjs-avoid-subject-as-event-bus',
                message: `Avoid using ${detectedType} for local event streams in components. Consider Signals or direct handlers for simpler, more performant communication.`,
                line,
                column,
                severity: 'moderate',
                fix: RECOMMENDATIONS['rxjs-avoid-subject-as-event-bus'],
            };
        }

        return null;
    }
);
