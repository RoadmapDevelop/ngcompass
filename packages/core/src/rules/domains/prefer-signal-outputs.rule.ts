/**
 * prefer-signal-outputs
 *
 * Enforces signal-based output() function over @Output() decorator and EventEmitter.
 * Signal-based outputs are more efficient and integrate better with modern Angular reactivity.
 * (Angular 17.3+)
 */

import { createComponentRule } from '../engine/rule-handler.js';
import type { AngularClassNode } from '../engine/node-streams.js';
import type { RuleContext, RuleFailure } from '../types.js';
import { getDecoratorNameUnsafe } from '../ast/matchers.js';
import type { PropertyDefinition } from '../ast/types.js';
import { RECOMMENDATIONS } from '../recommendations.js';

export const preferSignalOutputsRule = createComponentRule(
    'prefer-signal-outputs',
    (classNode: AngularClassNode, context: RuleContext): RuleFailure[] | null => {
        const body = classNode.node.body?.body;
        if (!body) return null;

        const failures: RuleFailure[] = [];

        for (const member of body) {
            if (member.type !== 'PropertyDefinition') continue;
            const prop = member as PropertyDefinition;
            if (!prop.decorators || prop.decorators.length === 0) continue;

            for (const decorator of prop.decorators) {
                const name = getDecoratorNameUnsafe(decorator);
                if (name === 'Output') {
                    const offset = decorator.start ?? decorator.span?.start ?? classNode.metadata.decoratorStart;
                    const { line, column } = context.locator.location(offset);

                    failures.push({
                        filePath: context.filePath,
                        message: `Use output() function instead of @Output() decorator.`,
                        line,
                        column,
                        severity: 'moderate',
                        ruleName: 'prefer-signal-outputs',
                        fix: RECOMMENDATIONS['prefer-signal-outputs'],
                    });
                    break;
                }
            }
        }

        return failures.length > 0 ? failures : null;
    }
);
