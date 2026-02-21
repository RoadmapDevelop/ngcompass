/**
 * rxjs-no-async-subscribe
 *
 * Disallows async functions as arguments to Observable.subscribe().
 *
 * Using an async callback inside subscribe() breaks RxJS error propagation:
 * - The async function returns a Promise
 * - subscribe() receives a Promise, not the async result
 * - Errors thrown inside the async callback become unhandled Promise rejections
 *   instead of being routed to subscribe's error handler
 * - Memory leaks and race conditions are common consequences
 *
 * Correct alternative: use switchMap / concatMap / mergeMap to chain async
 * operations within the RxJS pipeline.
 *
 * Priority 5 — RxJS Safety
 */

import { createComponentRule } from '../engine/rule-handler.js';
import type { AngularClassNode } from '../engine/node-streams.js';
import type { RuleContext, RuleFailure } from '../types.js';
import { walkProgram } from '../visitor.js';
import { RECOMMENDATIONS } from '../recommendations.js';

/** Returns true if a node is a .subscribe() CallExpression. */
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

/** Returns true if a node is an async arrow or function expression. */
const isAsyncFunction = (node: any): boolean => {
    if (!node) return false;
    if (node.type === 'ArrowFunctionExpression' || node.type === 'FunctionExpression') {
        return node.async === true;
    }
    return false;
};

export const rxjsNoAsyncSubscribeRule = createComponentRule(
    'rxjs-no-async-subscribe',
    (classNode: AngularClassNode, context: RuleContext): RuleFailure[] | null => {
        const classBody = classNode.node.body;
        if (!classBody) return null;

        const failures: RuleFailure[] = [];

        walkProgram(classBody, (node) => {
            if (!isSubscribeCall(node)) return;

            const args = node.arguments;
            if (!args || args.length === 0) return false;

            // Check if the first argument (next callback) is async
            for (let i = 0; i < args.length; i++) {
                if (isAsyncFunction(args[i])) {
                    const offset = node.start ?? node.span?.start ?? classNode.metadata.decoratorStart;
                    const { line, column } = context.locator.location(offset);

                    failures.push({
                        filePath: context.filePath,
                        message: `async callback inside subscribe() breaks RxJS error propagation. Use switchMap or concatMap instead.`,
                        line,
                        column,
                        severity: 'high',
                        ruleName: 'rxjs-no-async-subscribe',
                        fix: RECOMMENDATIONS['rxjs-no-async-subscribe'],
                    });
                    break;
                }
            }

            return false; // don't descend into subscribe args
        });

        return failures.length > 0 ? failures : null;
    }
);
