import { createDecoratedPropertyRule } from '../engine/rule-handler.js';
import type { DecoratedPropertyNode } from '../engine/node-streams.js';
import type { RuleContext, RuleFailure } from '../types.js';
import { RECOMMENDATIONS } from '../recommendations.js';

/**
 * rxjs-prefer-toSignal-for-template-state
 * 
 * Suggests converting Observables that are likely used in templates to Signals.
 * Signals are more performant for template rendering as they don't require the async pipe
 * and participate in Angular's local change detection.
 */
export const rxjsPreferToSignalRule = createDecoratedPropertyRule(
    'rxjs-prefer-toSignal-for-template-state',
    (streamNode: DecoratedPropertyNode, context: RuleContext): RuleFailure | null => {
        const node = streamNode.node;

        // Match properties ending with $ (common RxJS convention)
        if (node.key.type === 'Identifier' && (node.key as any).name.endsWith('$')) {
            const start = node.start ?? node.span?.start ?? 0;
            const { line, column } = context.locator.location(start);

            return {
                filePath: context.filePath,
                ruleName: 'rxjs-prefer-toSignal-for-template-state',
                message: `Observable "${(node.key as any).name}" should be converted to a Signal with toSignal() for better performance in templates.`,
                line,
                column,
                severity: 'low' as any,
                fix: RECOMMENDATIONS['rxjs-prefer-toSignal-for-template-state'],
            };
        }

        return null;
    }
);
