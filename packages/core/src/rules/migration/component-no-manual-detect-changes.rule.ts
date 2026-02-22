import { createCallExpressionRule } from '../engine/rule-handler.js';
import type { CallExpression } from '../ast/types.js';
import type { RuleContext, RuleFailure } from '../types.js';
import { RECOMMENDATIONS } from '../recommendations.js';

const DISCOURAGED_CDR_METHODS = new Set(['detectChanges', 'markForCheck']);

/**
 * component-no-manual-detect-changes
 * 
 * Detects manual calls to ChangeDetectorRef methods.
 * In modern Angular, state changes should be driven by Signals,
 * which automatically handle change detection more efficiently.
 */
export const componentNoManualDetectChangesRule = createCallExpressionRule(
    'component-no-manual-detect-changes',
    (node: CallExpression, context: RuleContext): RuleFailure | null => {
        if (!context.filePath.endsWith('.component.ts')) return null;

        const callee = node.callee;
        let methodName = '';

        // 1. Handle this.cdr.detectChanges(), cdr.detectChanges(), or cdr?.detectChanges()
        if (callee.type === 'MemberExpression' || callee.type === 'StaticMemberExpression' || (callee.type as string) === 'OptionalMemberExpression') {
            const member = callee as any;
            methodName = member.property?.name;
        }
        // 2. Handle destructured detectChanges()
        else if (callee.type === 'Identifier') {
            methodName = (callee as any).name;
        }

        if (DISCOURAGED_CDR_METHODS.has(methodName)) {
            const start = node.start ?? node.span?.start ?? 0;
            const { line, column } = context.locator.location(start);

            return {
                filePath: context.filePath,
                ruleName: 'component-no-manual-detect-changes',
                message: 'Avoid manual change detection. Use Signals for automatic reactivity.',
                line,
                column,
                severity: 'high',
                fix: RECOMMENDATIONS['component-no-manual-detect-changes'],
            };
        }

        return null;
    }
);
