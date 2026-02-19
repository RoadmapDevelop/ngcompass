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
import type { Identifier } from '../ast/types.js';
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

        const key = propertyNode.node.key;
        const propertyName = key.type === 'Identifier' ? (key as Identifier).name : 'Unknown';

        return {
            filePath: context.filePath,
            message: `Property '${propertyName}' uses @Input() decorator. Consider using signal-based input() function for better type safety and reactivity.`,
            line,
            column,
            severity: 'moderate',
            ruleName: 'prefer-signal-inputs',
            fix: RECOMMENDATIONS['prefer-signal-inputs'],
        };
    }
);
