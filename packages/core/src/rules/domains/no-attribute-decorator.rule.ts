/**
 * no-attribute-decorator
 *
 * Disallows the use of the @Attribute() constructor parameter decorator.
 *
 * @Attribute() is a legacy API for injecting host element attribute values.
 * In Angular 14+, input() signals and @Input() provide better alternatives
 * that participate in change detection and the component's reactive graph.
 *
 * Tier P2 — Migration Support (Score: 14, Effort: 30hrs)
 */

import { createComponentRule } from '../engine/rule-handler.js';
import type { AngularClassNode } from '../engine/node-streams.js';
import type { RuleContext, RuleFailure } from '../types.js';
import { getDecoratorNameUnsafe } from '../ast/matchers.js';
import { RECOMMENDATIONS } from '../recommendations.js';

export const noAttributeDecoratorRule = createComponentRule(
    'no-attribute-decorator',
    (classNode: AngularClassNode, context: RuleContext): RuleFailure[] | null => {
        const body = classNode.node.body?.body;
        if (!body) return null;

        const failures: RuleFailure[] = [];

        for (const member of body) {
            if (member.type !== 'MethodDefinition') continue;
            const method = member as any;
            if (method.kind !== 'constructor') continue;

            const params = method.value?.params ?? [];
            for (const param of params) {
                const decorators = param.decorators ?? [];
                for (const decorator of decorators) {
                    if (getDecoratorNameUnsafe(decorator) !== 'Attribute') continue;

                    const offset = decorator.start ?? decorator.span?.start ?? classNode.metadata.decoratorStart;
                    const { line, column } = context.locator.location(offset);

                    failures.push({
                        filePath: context.filePath,
                        message: `Use @Input() or input() instead of legacy @Attribute().`,
                        line,
                        column,
                        severity: 'low',
                        ruleName: 'no-attribute-decorator',
                        fix: RECOMMENDATIONS['no-attribute-decorator'],
                    });
                }
            }
        }

        return failures.length > 0 ? failures : null;
    }
);
