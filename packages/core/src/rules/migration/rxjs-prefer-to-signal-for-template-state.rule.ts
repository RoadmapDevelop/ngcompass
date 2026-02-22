import { createAnyAngularClassRule } from '../engine/rule-handler.js';
import type { AnyAngularClassNode } from '../engine/node-streams.js';
import type { RuleContext, RuleFailure } from '../types.js';
import { RECOMMENDATIONS } from '../recommendations.js';

/**
 * rxjs-prefer-toSignal-for-template-state
 *
 * Suggests converting Observables that are likely used in templates to Signals.
 * Signals are more performant for template rendering as they don't require the
 * async pipe and participate in Angular's local change detection.
 *
 * Detection: Any class property whose name ends with '$' (the RxJS convention)
 * on any Angular-decorated class (@Component, @Directive, @Injectable, etc.).
 *
 * Previously used DecoratedPropertyNode (only @Input/@Output decorated props).
 * Now uses AnyAngularClassRule to scan ALL class properties, which is where
 * Observable template state actually lives in practice.
 */
export const rxjsPreferToSignalRule = createAnyAngularClassRule(
    'rxjs-prefer-toSignal-for-template-state',
    (streamNode: AnyAngularClassNode, context: RuleContext): RuleFailure[] | null => {
        const classBody = streamNode.node.body?.body ?? [];
        const failures: RuleFailure[] = [];

        for (const member of classBody) {
            if (member.type !== 'PropertyDefinition') continue;

            const prop = member as any;
            const key = prop.key;
            if (!key || key.type !== 'Identifier') continue;

            const propName: string = key.name;
            if (!propName.endsWith('$')) continue;

            const start = prop.start ?? prop.span?.start ?? 0;
            const { line, column } = context.locator.location(start);

            failures.push({
                filePath: context.filePath,
                ruleName: 'rxjs-prefer-toSignal-for-template-state',
                message: `Observable "${propName}" should be converted to a Signal with toSignal() for better performance in templates.`,
                line,
                column,
                severity: 'low',
                fix: RECOMMENDATIONS['rxjs-prefer-toSignal-for-template-state'],
            });
        }

        return failures.length > 0 ? failures : null;
    }
);
