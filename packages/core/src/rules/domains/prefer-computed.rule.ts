/**
 * prefer-computed
 *
 * Detects getter methods in signal-based components that read signal inputs,
 * suggesting they could be replaced with computed() for automatic memoisation
 * and integration with Angular's reactive graph.
 *
 * Pattern detected:
 *   get fullName() { return this.firstName() + ' ' + this.lastName(); }
 *   // ^ reads signal inputs via () call — should be computed()
 *
 * Preferred:
 *   fullName = computed(() => this.firstName() + ' ' + this.lastName());
 *
 * Detection strategy (syntax-only, no type info):
 *   A class getter that contains at least one call expression of the form
 *   `this.xxx()` (i.e. calling a property as a function, consistent with
 *   signal access pattern) is a candidate.
 *
 * Priority 4 — Signal Modernisation
 */

import { createComponentRule } from '../engine/rule-handler.js';
import type { AngularClassNode } from '../engine/node-streams.js';
import type { RuleContext, RuleFailure } from '../types.js';
import { walkProgram } from '../visitor.js';
import { RECOMMENDATIONS } from '../recommendations.js';

/** Returns true if the AST subtree contains at least one `this.xxx()` call. */
const containsSignalCall = (node: any): boolean => {
    let found = false;
    walkProgram(node, (child) => {
        if (found) return false;
        if (child.type !== 'CallExpression') return;

        const callee = child.callee;
        if (
            callee &&
            (callee.type === 'MemberExpression' || callee.type === 'StaticMemberExpression') &&
            callee.object?.type === 'ThisExpression' &&
            callee.property?.type === 'Identifier' &&
            child.arguments?.length === 0
        ) {
            found = true;
            return false;
        }
    });
    return found;
};

export const preferComputedRule = createComponentRule(
    'prefer-computed',
    (classNode: AngularClassNode, context: RuleContext): RuleFailure[] | null => {
        const body = classNode.node.body?.body;
        if (!body) return null;

        const failures: RuleFailure[] = [];

        for (const member of body) {
            // Only look at getter MethodDefinitions
            if (member.type !== 'MethodDefinition') continue;
            const method = member as any;
            if (method.kind !== 'get') continue;

            const getterName = method.key?.type === 'Identifier' ? method.key.name : undefined;
            if (!getterName) continue;

            const getterBody = method.value?.body;
            if (!getterBody) continue;

            // If the getter reads signal-like calls (this.xxx()), suggest computed()
            if (!containsSignalCall(getterBody)) continue;

            const offset = method.start ?? method.span?.start ?? classNode.metadata.decoratorStart;
            const { line, column } = context.locator.location(offset);

            failures.push({
                filePath: context.filePath,
                message: `Getter '${getterName}' reads signal-like calls — replace it with a computed() signal for automatic memoisation.`,
                line,
                column,
                severity: 'low',
                ruleName: 'prefer-computed',
                fix: RECOMMENDATIONS['prefer-computed'],
            });
        }

        return failures.length > 0 ? failures : null;
    }
);
