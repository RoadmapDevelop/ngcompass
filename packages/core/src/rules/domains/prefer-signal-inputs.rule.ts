/**
 * prefer-signal-inputs
 *
 * Enforces signal-based input() function over @Input() decorator.
 * Encourages modern Angular patterns with improved type safety and reactivity.
 */

import { createDecoratedPropertyRule } from '../engine/rule-handler.js';
import type { DecoratedPropertyNode } from '../engine/node-streams.js';
import type { RuleContext, RuleFailure } from '../types.js';
import { getDecoratorNameUnsafe } from '../ast/matchers.js';

import { RECOMMENDATIONS } from '../recommendations.js';

export const preferSignalInputsRule = createDecoratedPropertyRule(
    'prefer-signal-inputs',
    (propertyNode: DecoratedPropertyNode, context: RuleContext): RuleFailure | null => {
        // Check if property has @Input decorator
        let hasInputDecorator = false;
        let decoratorStart = 0;

        for (let i = 0; i < propertyNode.decorators.length; i++) {
            const decorator = propertyNode.decorators[i];
            const name = getDecoratorNameUnsafe(decorator);

            if (name === 'Input') {
                hasInputDecorator = true;
                decoratorStart = decorator.start ?? decorator.span?.start ?? 0;
                break;
            }
        }

        // Not an @Input? Pass.
        if (!hasInputDecorator) return null;

        // Report: recommend signal-based input()
        const { line, column } = context.locator.location(decoratorStart);



        return {
            filePath: context.filePath,
            message: `Use input() signal instead of @Input() decorator.`,
            line,
            column,
            severity: 'moderate',
            ruleName: 'prefer-signal-inputs',
            fix: RECOMMENDATIONS['prefer-signal-inputs'],
        };
    }
);
