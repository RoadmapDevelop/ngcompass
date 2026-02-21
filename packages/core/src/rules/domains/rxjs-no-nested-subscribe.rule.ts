/**
 * rxjs-no-nested-subscribe
 *
 * Detects nested subscribe() calls within Angular components.
 * Nested subscribes are a common anti-pattern that leads to:
 * - Memory leaks (inner subscriptions not cleaned up)
 * - Race conditions
 * - Hard-to-maintain code
 *
 * Use higher-order mapping operators (switchMap, mergeMap, concatMap) instead.
 */

import { createComponentRule } from '../engine/rule-handler.js';
import type { AngularClassNode } from '../engine/node-streams.js';
import type { RuleContext, RuleFailure } from '../types.js';
import { walkProgram } from '../visitor.js';
import { RECOMMENDATIONS } from '../recommendations.js';

/**
 * Checks if a CallExpression is a .subscribe() call.
 */
const isSubscribeCall = (node: any): boolean => {
    if (node.type !== 'CallExpression') return false;
    const callee = node.callee;
    if (!callee) return false;

    // obj.subscribe()
    if (callee.type === 'MemberExpression' || callee.type === 'StaticMemberExpression') {
        const prop = callee.property;
        return prop?.type === 'Identifier' && prop.name === 'subscribe';
    }

    return false;
};

export const rxjsNoNestedSubscribeRule = createComponentRule(
    'rxjs-no-nested-subscribe',
    (classNode: AngularClassNode, context: RuleContext): RuleFailure[] | null => {
        const classBody = classNode.node.body;
        if (!classBody) return null;

        const failures: RuleFailure[] = [];


        // Walk the class body looking for subscribe calls
        walkProgram(classBody, (node) => {
            if (isSubscribeCall(node)) {
                // Found a subscribe call - check its arguments for nested subscribes
                const args = node.arguments;
                if (!args || args.length === 0) return false;

                // Walk the subscribe callback arguments looking for inner subscribes
                for (let i = 0; i < args.length; i++) {
                    walkProgram(args[i], (inner) => {
                        if (isSubscribeCall(inner)) {
                            const offset = inner.start ?? inner.span?.start ?? classNode.metadata.decoratorStart;
                            const { line, column } = context.locator.location(offset);

                            failures.push({
                                filePath: context.filePath,
                                message: `Nested subscribe() detected. Use transformation operators (switchMap, etc).`,
                                line,
                                column,
                                severity: 'high',
                                ruleName: 'rxjs-no-nested-subscribe',
                                fix: RECOMMENDATIONS['rxjs-no-nested-subscribe'],
                            });
                            // Don't descend into *this* nested subscribe's args
                            return false;
                        }
                    });
                }

                // Don't descend further from this outer subscribe (we already checked its args)
                return false;
            }
        });

        return failures.length > 0 ? failures : null;
    }
);
