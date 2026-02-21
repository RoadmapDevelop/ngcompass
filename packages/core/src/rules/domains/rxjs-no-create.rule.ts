/**
 * rxjs-no-create
 *
 * Disallows use of the deprecated Observable.create() factory.
 *
 * Observable.create() was removed in RxJS 7. The replacement is
 * `new Observable(subscriber => { ... })` which has identical semantics
 * and is the standard constructor pattern.
 *
 * Tier P2 — Migration Support (Score: 14, Effort: 25hrs)
 * Migration Critical: YES — breaks at RxJS 7+
 */

import { createComponentRule } from '../engine/rule-handler.js';
import type { AngularClassNode } from '../engine/node-streams.js';
import type { RuleContext, RuleFailure } from '../types.js';
import { walkProgram } from '../visitor.js';
import { RECOMMENDATIONS } from '../recommendations.js';

/**
 * Checks if a node is a `Observable.create(...)` call.
 */
function isObservableCreate(node: any): boolean {
    if (node.type !== 'CallExpression') return false;
    const callee = node.callee;
    if (!callee) return false;

    // Observable.create(...)
    if (
        (callee.type === 'MemberExpression' || callee.type === 'StaticMemberExpression') &&
        callee.object?.type === 'Identifier' &&
        callee.object.name === 'Observable' &&
        callee.property?.type === 'Identifier' &&
        callee.property.name === 'create'
    ) {
        return true;
    }

    return false;
}

export const rxjsNoCreateRule = createComponentRule(
    'rxjs-no-create',
    (classNode: AngularClassNode, context: RuleContext): RuleFailure[] | null => {
        const classBody = classNode.node.body;
        if (!classBody) return null;

        const failures: RuleFailure[] = [];

        walkProgram(classBody, (node) => {
            if (!isObservableCreate(node)) return;

            const offset = node.start ?? node.span?.start ?? classNode.metadata.decoratorStart;
            const { line, column } = context.locator.location(offset);

            failures.push({
                filePath: context.filePath,
                message: `Observable.create() is deprecated. Use new Observable().`,
                line,
                column,
                severity: 'high',
                ruleName: 'rxjs-no-create',
                fix: RECOMMENDATIONS['rxjs-no-create'],
            });
            return false;
        });

        return failures.length > 0 ? failures : null;
    }
);
