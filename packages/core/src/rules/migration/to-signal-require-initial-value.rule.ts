import { createCallExpressionRule } from '../engine/rule-handler.js';
import type { CallExpression, ObjectExpression } from '../ast/types.js';
import type { RuleContext, RuleFailure } from '../types.js';
import { RECOMMENDATIONS } from '../recommendations.js';
import { hasObjectProperty } from '../ast/matchers.js';

/**
 * toSignal-require-initialValue
 * 
 * Encourages provide explicit initialValue to toSignal().
 * This improves type safety and prevents unexpected 'undefined' states in templates.
 */
export const toSignalRequireInitialValueRule = createCallExpressionRule(
    'toSignal-require-initialValue',
    (node: CallExpression, context: RuleContext): RuleFailure | null => {
        const callee = node.callee;

        // Identify 'toSignal' call
        let isToSignal = false;
        if (callee.type === 'Identifier') {
            isToSignal = (callee as any).name === 'toSignal';
        } else if (callee.type === 'MemberExpression' || callee.type === 'StaticMemberExpression') {
            const member = callee as any;
            if (member.property && member.property.name === 'toSignal') {
                isToSignal = true;
            }
        }

        if (!isToSignal) return null;

        // toSignal(obs, options)
        const args = node.arguments;

        // If second argument (options) is missing, or is an object missing 'initialValue'
        let missingInitialValue = false;
        if (args.length < 2) {
            missingInitialValue = true;
        } else {
            const options = args[1];
            if (options.type === 'ObjectExpression') {
                if (!hasObjectProperty(options as ObjectExpression, 'initialValue') &&
                    !hasObjectProperty(options as ObjectExpression, 'requireSync')) {
                    // requireSync: true also fulfills the need for initial value (it throws if not sync)
                    // but usually we want initialValue.
                    missingInitialValue = true;
                }
            } else {
                // Dynamic options, skip to avoid false positives
                return null;
            }
        }

        if (missingInitialValue) {
            const start = node.start ?? node.span?.start ?? 0;
            const { line, column } = context.locator.location(start);

            return {
                filePath: context.filePath,
                ruleName: 'toSignal-require-initialValue',
                message: 'Provide an initialValue to toSignal() for better type safety and predictable state.',
                line,
                column,
                severity: 'moderate',
                fix: RECOMMENDATIONS['toSignal-require-initialValue'],
            };
        }

        return null;
    }
);
