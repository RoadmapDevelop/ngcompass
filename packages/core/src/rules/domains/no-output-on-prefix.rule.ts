/**
 * no-output-on-prefix
 *
 * Disallows @Output() event emitter names that start with the prefix "on".
 *
 * Angular templates bind to outputs with the `(eventName)="handler()"` syntax.
 * If an output is named `onSave`, the template binding becomes `(onSave)="..."`,
 * which reads as "on on-save" — a confusing double-preposition. Angular Style
 * Guide recommends the event name itself without the "on" prefix (e.g., `save`),
 * leaving "on" for the template consumer's handler naming.
 *
 * Tier P4 — Naming & Conventions (Score: 10, Effort: 25hrs)
 */

import { createComponentRule } from '../engine/rule-handler.js';
import type { AngularClassNode } from '../engine/node-streams.js';
import type { RuleContext, RuleFailure } from '../types.js';
import { getDecoratorNameUnsafe, getLiteralStringValueUnsafe } from '../ast/matchers.js';
import type { PropertyDefinition, Identifier, CallExpression } from '../ast/types.js';
import { RECOMMENDATIONS } from '../recommendations.js';

export const noOutputOnPrefixRule = createComponentRule(
    'no-output-on-prefix',
    (classNode: AngularClassNode, context: RuleContext): RuleFailure[] | null => {
        const body = classNode.node.body?.body;
        if (!body) return null;

        const failures: RuleFailure[] = [];

        for (const member of body) {
            if (member.type !== 'PropertyDefinition') continue;
            const prop = member as PropertyDefinition;
            if (!prop.decorators || prop.decorators.length === 0) continue;

            for (const decorator of prop.decorators) {
                if (getDecoratorNameUnsafe(decorator) !== 'Output') continue;

                const propName = prop.key.type === 'Identifier'
                    ? (prop.key as Identifier).name
                    : undefined;

                // Resolve event name — prefer explicit alias, fall back to property name
                let eventName = propName;
                const expr = decorator.expression as any;
                if (expr?.type === 'CallExpression') {
                    const args = (expr as CallExpression).arguments;
                    if (args.length > 0) {
                        const alias = getLiteralStringValueUnsafe(args[0] as any);
                        if (alias) eventName = alias;
                    }
                }

                if (!eventName) continue;

                // Check for 'on' prefix followed by an uppercase letter (camelCase) or end
                if (!/^on[A-Z]/.test(eventName) && eventName !== 'on') continue;

                const suggested = eventName.charAt(2).toLowerCase() + eventName.slice(3);
                const offset = decorator.start ?? decorator.span?.start ?? classNode.metadata.decoratorStart;
                const { line, column } = context.locator.location(offset);

                failures.push({
                    filePath: context.filePath,
                    message: `Output '${eventName}' should not start with 'on'. Rename to '${suggested}'.`,
                    line,
                    column,
                    severity: 'low',
                    ruleName: 'no-output-on-prefix',
                    fix: RECOMMENDATIONS['no-output-on-prefix'],
                });
                break;
            }
        }

        return failures.length > 0 ? failures : null;
    }
);
