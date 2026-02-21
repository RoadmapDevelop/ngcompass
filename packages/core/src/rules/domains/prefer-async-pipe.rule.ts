/**
 * prefer-async-pipe
 *
 * Detects manual Observable subscriptions inside ngOnInit that assign values
 * to component properties — a common pattern that can be replaced with the
 * async pipe, eliminating the need for manual subscription management.
 *
 * Pattern detected:
 *   ngOnInit() { this.obs$.subscribe(v => this.prop = v); }
 *
 * Preferred alternative (template-driven):
 *   {{ obs$ | async }}
 *
 * This rule specifically flags subscriptions inside ngOnInit to reduce noise.
 * Subscriptions in constructors and other lifecycle hooks are not flagged
 * because they often involve side-effects that the async pipe cannot express.
 *
 * Priority 3 — Template Coverage / Reactive Patterns
 */

import { createComponentRule } from '../engine/rule-handler.js';
import type { AngularClassNode } from '../engine/node-streams.js';
import type { RuleContext, RuleFailure } from '../types.js';
import { walkProgram } from '../visitor.js';
import { RECOMMENDATIONS } from '../recommendations.js';

/** Returns true if a node is a .subscribe() call expression. */
const isSubscribeCall = (node: any): boolean => {
    if (node.type !== 'CallExpression') return false;
    const callee = node.callee;
    if (!callee) return false;
    if (callee.type === 'MemberExpression' || callee.type === 'StaticMemberExpression') {
        const prop = callee.property;
        return prop?.type === 'Identifier' && prop.name === 'subscribe';
    }
    return false;
};

/** Returns true if an arrow/function expression contains a `this.x = ...` assignment. */
const containsPropertyAssignment = (fn: any): boolean => {
    let found = false;
    walkProgram(fn, (child) => {
        if (found) return false;
        if (child.type !== 'AssignmentExpression') return;
        const left = child.left;
        // Match: this.property = ...
        if (
            left &&
            (left.type === 'MemberExpression' || left.type === 'StaticMemberExpression') &&
            left.object?.type === 'ThisExpression'
        ) {
            found = true;
            return false;
        }
    });
    return found;
};

export const preferAsyncPipeRule = createComponentRule(
    'prefer-async-pipe',
    (classNode: AngularClassNode, context: RuleContext): RuleFailure[] | null => {
        const body = classNode.node.body?.body;
        if (!body) return null;

        const failures: RuleFailure[] = [];

        // Find ngOnInit method
        for (const member of body) {
            if (member.type !== 'MethodDefinition') continue;
            const method = member as any;
            const methodName = method.key?.type === 'Identifier' ? method.key.name : undefined;
            if (methodName !== 'ngOnInit') continue;

            const methodBody = method.value?.body;
            if (!methodBody) continue;

            // Walk ngOnInit body for subscribe() calls
            walkProgram(methodBody, (node) => {
                if (!isSubscribeCall(node)) return;

                // Only flag if the subscribe callback assigns to a component property
                const args = node.arguments;
                if (!args || args.length === 0) return false;

                const callback = args[0];
                const isArrowOrFunction =
                    callback.type === 'ArrowFunctionExpression' ||
                    callback.type === 'FunctionExpression';

                if (isArrowOrFunction && containsPropertyAssignment(callback)) {
                    const offset = node.start ?? node.span?.start ?? classNode.metadata.decoratorStart;
                    const { line, column } = context.locator.location(offset);

                    failures.push({
                        filePath: context.filePath,
                        message: `Manual subscription in ngOnInit assigns to a component property — consider using the async pipe in the template instead.`,
                        line,
                        column,
                        severity: 'low',
                        ruleName: 'prefer-async-pipe',
                        fix: RECOMMENDATIONS['prefer-async-pipe'],
                    });
                }

                return false; // don't descend into subscribe args
            });

            break; // only one ngOnInit
        }

        return failures.length > 0 ? failures : null;
    }
);
