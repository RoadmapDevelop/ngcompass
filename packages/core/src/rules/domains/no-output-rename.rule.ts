/**
 * no-output-rename
 *
 * Disallows aliasing @Output() event emitters to a different public name.
 *
 * Renaming outputs with @Output('alias') creates a mismatch between the
 * property name and its public binding name, breaking refactoring tools
 * and making the API harder to understand. The Angular Style Guide (rule 05-13)
 * recommends avoiding aliases unless necessary (e.g., a directive selector
 * conflict).
 *
 * Tier P4 — Naming & Conventions (Score: 10, Effort: 25hrs)
 */

import { createComponentRule } from '../engine/rule-handler.js';
import type { AngularClassNode } from '../engine/node-streams.js';
import type { RuleContext, RuleFailure } from '../types.js';
import { getDecoratorNameUnsafe, getLiteralStringValueUnsafe } from '../ast/matchers.js';
import type { PropertyDefinition, Identifier, CallExpression } from '../ast/types.js';
import { RECOMMENDATIONS } from '../recommendations.js';

export const noOutputRenameRule = createComponentRule(
    'no-output-rename',
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
                if (!propName) continue;

                // Extract alias from @Output('alias') if present
                const expr = decorator.expression as any;
                if (!expr || expr.type !== 'CallExpression') continue;

                const args = (expr as CallExpression).arguments;
                if (args.length === 0) continue;

                const alias = getLiteralStringValueUnsafe(args[0] as any);
                if (!alias) continue;

                // Only report if alias differs from property name
                if (alias === propName) continue;

                const offset = decorator.start ?? decorator.span?.start ?? classNode.metadata.decoratorStart;
                const { line, column } = context.locator.location(offset);

                failures.push({
                    filePath: context.filePath,
                    message: `Output '${propName}' should not be aliased to '${alias}'.`,
                    line,
                    column,
                    severity: 'moderate',
                    ruleName: 'no-output-rename',
                    fix: RECOMMENDATIONS['no-output-rename'],
                });
                break;
            }
        }

        return failures.length > 0 ? failures : null;
    }
);
