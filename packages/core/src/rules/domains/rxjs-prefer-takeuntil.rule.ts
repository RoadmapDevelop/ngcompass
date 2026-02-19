/**
 * rxjs-prefer-takeuntil
 *
 * Enforces unsubscription patterns in Angular components to prevent memory leaks.
 * Observable subscriptions in components must use one of:
 * - pipe(takeUntil(destroy$)) pattern
 * - pipe(takeUntilDestroyed()) pattern (Angular 16+)
 *
 * Without proper cleanup, subscriptions persist after component destruction,
 * causing memory leaks and unexpected side effects.
 *
 * Note: This rule checks for .subscribe() calls that are NOT preceded by
 * a takeUntil/takeUntilDestroyed in the pipe chain.
 */

import { createComponentRule } from '../engine/rule-handler.js';
import type { AngularClassNode } from '../engine/node-streams.js';
import type { RuleContext, RuleFailure } from '../types.js';
import { walkProgram } from '../visitor.js';
import { RECOMMENDATIONS } from '../recommendations.js';

/**
 * Checks if a pipe chain contains takeUntil or takeUntilDestroyed.
 * Walks the callee chain of .pipe(...).subscribe() looking for takeUntil calls.
 */
const hasTakeUntilInPipe = (subscribeNode: any): boolean => {
    const callee = subscribeNode.callee;
    if (!callee) return false;

    // .pipe(...).subscribe() pattern
    // callee is MemberExpression: { object: CallExpression(.pipe), property: 'subscribe' }
    const pipeCall = callee.object;
    if (!pipeCall) return false;

    // Check if the object is a .pipe() call
    if (pipeCall.type === 'CallExpression') {
        const pipeCallee = pipeCall.callee;
        if (pipeCallee &&
            (pipeCallee.type === 'MemberExpression' || pipeCallee.type === 'StaticMemberExpression') &&
            pipeCallee.property?.name === 'pipe') {

            // Check pipe arguments for takeUntil / takeUntilDestroyed
            const pipeArgs = pipeCall.arguments;
            if (pipeArgs) {
                for (let i = 0; i < pipeArgs.length; i++) {
                    const arg = pipeArgs[i];
                    if (isTakeUntilCall(arg)) return true;
                }
            }
        }

        // Could be chained: .pipe(op1).pipe(takeUntil(...)).subscribe()
        // Check recursively
        if (hasTakeUntilInChainedPipe(pipeCall)) return true;
    }

    return false;
};

/**
 * Recursively checks for takeUntil in chained .pipe() calls.
 */
const hasTakeUntilInChainedPipe = (node: any): boolean => {
    if (!node || node.type !== 'CallExpression') return false;

    const callee = node.callee;
    if (!callee) return false;

    if ((callee.type === 'MemberExpression' || callee.type === 'StaticMemberExpression') &&
        callee.property?.name === 'pipe') {
        const args = node.arguments;
        if (args) {
            for (let i = 0; i < args.length; i++) {
                if (isTakeUntilCall(args[i])) return true;
            }
        }

        // Check the object for further chaining
        if (callee.object?.type === 'CallExpression') {
            return hasTakeUntilInChainedPipe(callee.object);
        }
    }

    return false;
};

/**
 * Checks if an expression is a takeUntil() or takeUntilDestroyed() call.
 */
const isTakeUntilCall = (node: any): boolean => {
    if (!node || node.type !== 'CallExpression') return false;

    const callee = node.callee;
    if (!callee) return false;

    // Direct call: takeUntil(...) or takeUntilDestroyed(...)
    if (callee.type === 'Identifier') {
        return callee.name === 'takeUntil' || callee.name === 'takeUntilDestroyed';
    }

    return false;
};

export const rxjsPreferTakeuntilRule = createComponentRule(
    'rxjs-prefer-takeuntil',
    (classNode: AngularClassNode, context: RuleContext): RuleFailure[] | null => {
        const classBody = classNode.node.body;
        if (!classBody) return null;

        const failures: RuleFailure[] = [];
        const className = classNode.metadata.className || 'Unknown';

        walkProgram(classBody, (node) => {
            // Look for .subscribe() calls
            if (node.type === 'CallExpression') {
                const callee = node.callee;
                if (!callee) return;

                const isSubscribe =
                    (callee.type === 'MemberExpression' || callee.type === 'StaticMemberExpression') &&
                    callee.property?.type === 'Identifier' &&
                    callee.property.name === 'subscribe';

                if (isSubscribe) {
                    // Check if this subscribe has takeUntil in its pipe chain
                    if (!hasTakeUntilInPipe(node)) {
                        const offset = node.start ?? node.span?.start ?? classNode.metadata.decoratorStart;
                        const { line, column } = context.locator.location(offset);

                        failures.push({
                            filePath: context.filePath,
                            message: `RxJS subscription in '${className}' should be managed with 'takeUntil()'.`,
                            line,
                            column,
                            severity: 'high',
                            ruleName: 'rxjs-prefer-takeuntil',
                            fix: RECOMMENDATIONS['rxjs-prefer-takeuntil'],
                        });
                    }

                    // Don't descend into subscribe callbacks
                    return false;
                }
            }
        });

        return failures.length > 0 ? failures : null;
    }
);
