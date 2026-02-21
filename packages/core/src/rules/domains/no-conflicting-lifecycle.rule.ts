/**
 * no-conflicting-lifecycle
 *
 * Disallows Angular components from implementing lifecycle hooks that are
 * mutually exclusive or semantically conflicting:
 *
 * - DoCheck + OnChanges: DoCheck runs on every cycle; combining it with
 *   OnChanges creates confusing double-handling of input changes.
 * - OnInit + DoCheck: OnInit runs once; DoCheck runs every cycle. Using
 *   both for initialization logic leads to bugs.
 *
 * Tier P3 — Code Quality & Safety (Score: 12, Effort: 40hrs)
 */

import { createComponentRule } from '../engine/rule-handler.js';
import type { AngularClassNode } from '../engine/node-streams.js';
import type { RuleContext, RuleFailure } from '../types.js';
import { RECOMMENDATIONS } from '../recommendations.js';

/** Pairs of lifecycle hooks that conflict when both are present */
const CONFLICTING_PAIRS: ReadonlyArray<readonly [string, string, string]> = [
    [
        'ngDoCheck',
        'ngOnChanges',
        'DoCheck and OnChanges both respond to inputs.',
    ],
    [
        'ngDoCheck',
        'ngOnInit',
        'Initialization logic belongs in ngOnInit.',
    ],
];

function getLifecycleMethods(classNode: AngularClassNode): Set<string> {
    const body = classNode.node.body?.body;
    const found = new Set<string>();
    if (!body) return found;

    for (const member of body) {
        if (member.type !== 'MethodDefinition') continue;
        const method = member as any;
        const name = method.key?.type === 'Identifier' ? method.key.name : undefined;
        if (name) found.add(name);
    }
    return found;
}

function getMethodOffset(classNode: AngularClassNode, methodName: string): number {
    const body = classNode.node.body?.body;
    if (!body) return classNode.metadata.decoratorStart;

    for (const member of body) {
        if (member.type !== 'MethodDefinition') continue;
        const method = member as any;
        if (method.key?.name === methodName) {
            return method.start ?? method.span?.start ?? classNode.metadata.decoratorStart;
        }
    }
    return classNode.metadata.decoratorStart;
}

export const noConflictingLifecycleRule = createComponentRule(
    'no-conflicting-lifecycle',
    (classNode: AngularClassNode, context: RuleContext): RuleFailure[] | null => {
        const methods = getLifecycleMethods(classNode);
        const failures: RuleFailure[] = [];

        for (const [hookA, hookB, reason] of CONFLICTING_PAIRS) {
            if (!methods.has(hookA) || !methods.has(hookB)) continue;

            const offset = getMethodOffset(classNode, hookA);
            const { line, column } = context.locator.location(offset);

            failures.push({
                filePath: context.filePath,
                message: `Class implements conflicting hooks '${hookA}' and '${hookB}'. ${reason}`,
                line,
                column,
                severity: 'moderate',
                ruleName: 'no-conflicting-lifecycle',
                fix: RECOMMENDATIONS['no-conflicting-lifecycle'],
            });
        }

        return failures.length > 0 ? failures : null;
    }
);
