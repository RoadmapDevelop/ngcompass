/**
 * use-inject
 *
 * Enforces the use of Angular's inject() function instead of constructor-based
 * dependency injection in components and directives.
 *
 * Constructor injection couples the component's API to its DI graph, making
 * testing and inheritance harder. inject() is the Angular 14+ idiomatic
 * pattern, works in field initializers, and avoids boilerplate.
 *
 * Tier P2 — Migration Support (Score: 16, Effort: 50hrs)
 */

import { createComponentRule } from '../engine/rule-handler.js';
import type { AngularClassNode } from '../engine/node-streams.js';
import type { RuleContext, RuleFailure } from '../types.js';
import { RECOMMENDATIONS } from '../recommendations.js';

export const useInjectRule = createComponentRule(
    'use-inject',
    (classNode: AngularClassNode, context: RuleContext): RuleFailure | null => {
        const body = classNode.node.body?.body;
        if (!body) return null;

        for (const member of body) {
            // Find the constructor
            if (member.type !== 'MethodDefinition') continue;
            const method = member as any;
            if (method.kind !== 'constructor') continue;

            // Check if constructor has parameters with type annotations (injected deps)
            const params = method.value?.params ?? [];
            const hasInjectedParams = params.some((p: any) => {
                // Decorated params: @Inject(TOKEN) or TSParameterProperty with decorators
                if (p.type === 'TSParameterProperty') {
                    return p.decorators && p.decorators.length > 0
                        ? true
                        : p.accessibility !== undefined; // public/private/protected = injected
                }
                // Params with type annotation and access modifier are injections
                return p.accessibility !== undefined;
            });

            if (!hasInjectedParams) return null;

            const offset = method.start ?? method.span?.start ?? classNode.metadata.decoratorStart;
            const { line, column } = context.locator.location(offset);

            return {
                filePath: context.filePath,
                message: `Constructor injection in '${classNode.metadata.className ?? 'Unknown'}' should be replaced with inject().`,
                line,
                column,
                severity: 'moderate',
                ruleName: 'use-inject',
                fix: RECOMMENDATIONS['use-inject'],
            };
        }

        return null;
    }
);
