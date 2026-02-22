import { createCallExpressionRule } from '../engine/rule-handler.js';
import type { CallExpression } from '../ast/types.js';
import type { RuleContext, RuleFailure } from '../types.js';
import { RECOMMENDATIONS } from '../recommendations.js';

const DISCOURAGED_CDR_METHODS = new Set(['detectChanges', 'markForCheck']);

/**
 * Common variable names used to hold a ChangeDetectorRef instance.
 * Used as a heuristic to avoid false positives on unrelated method calls
 * like this.someService.detectChanges() on a non-CDR object.
 */
const CDR_VAR_NAMES = new Set([
    'cdr', 'cd', 'changeDetectorRef', 'changeDetector',
    '_cdr', '_cd', 'detector', 'cdRef', 'ref',
]);

/**
 * component-no-manual-detect-changes
 *
 * Detects manual calls to ChangeDetectorRef methods.
 * In modern Angular, state changes should be driven by Signals,
 * which automatically handle change detection more efficiently.
 *
 * Heuristic: For MemberExpression calls, only flags when the receiver object
 * name matches common CDR variable naming conventions to avoid false positives
 * on unrelated objects that happen to have the same method names.
 */
export const componentNoManualDetectChangesRule = createCallExpressionRule(
    'component-no-manual-detect-changes',
    (node: CallExpression, context: RuleContext): RuleFailure | null => {
        if (!context.filePath.endsWith('.component.ts')) return null;

        const callee = node.callee;
        let methodName = '';
        let shouldFlag = false;

        // 1. Handle this.cdr.detectChanges(), cdr.detectChanges(), or cdr?.detectChanges()
        if (callee.type === 'MemberExpression' || callee.type === 'StaticMemberExpression' || (callee.type as string) === 'OptionalMemberExpression') {
            const member = callee as any;
            methodName = member.property?.name ?? '';

            if (DISCOURAGED_CDR_METHODS.has(methodName)) {
                // Apply heuristic: check if the receiver object looks like a CDR instance.
                // This prevents false positives like this.someService.detectChanges().
                const receiverObj = member.object;
                const receiverName: string =
                    receiverObj?.type === 'Identifier' ? receiverObj.name :            // cdr.detectChanges()
                    receiverObj?.type === 'MemberExpression' || receiverObj?.type === 'StaticMemberExpression'
                        ? receiverObj.property?.name ?? ''                             // this.cdr.detectChanges()
                        : '';

                shouldFlag = CDR_VAR_NAMES.has(receiverName.toLowerCase());
            }
        }
        // 2. Handle destructured detectChanges() — always flag these
        else if (callee.type === 'Identifier') {
            methodName = (callee as any).name;
            shouldFlag = DISCOURAGED_CDR_METHODS.has(methodName);
        }

        if (shouldFlag) {
            const start = node.start ?? node.span?.start ?? 0;
            const { line, column } = context.locator.location(start);

            return {
                filePath: context.filePath,
                ruleName: 'component-no-manual-detect-changes',
                message: `Avoid manual change detection (${methodName}). Use Signals for automatic reactivity.`,
                line,
                column,
                severity: 'high',
                fix: RECOMMENDATIONS['component-no-manual-detect-changes'],
            };
        }

        return null;
    }
);
