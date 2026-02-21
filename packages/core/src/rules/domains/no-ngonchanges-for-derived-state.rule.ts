/**
 * no-ngonchanges-for-derived-state
 *
 * Flags ngOnChanges() implementations that exclusively compute derived
 * state (assignments to `this.xxx` properties) from input changes.
 *
 * This pattern is the classic pre-signals approach to deriving values from
 * inputs. With Angular signals, the same result is achieved more cleanly with
 * computed() signals, which are lazy, memoised, and automatically tracked.
 *
 * Detection strategy:
 *   ngOnChanges() method whose body contains ONLY ExpressionStatement nodes
 *   that are AssignmentExpressions to `this.xxx` — i.e. pure derivation with
 *   no side-effects (no function calls, logging, service calls, etc.).
 *
 * Priority 4 — Signal Modernisation
 */

import { createComponentRule } from '../engine/rule-handler.js';
import type { AngularClassNode } from '../engine/node-streams.js';
import type { RuleContext, RuleFailure } from '../types.js';
import { RECOMMENDATIONS } from '../recommendations.js';

/** Returns true if a statement is a `this.xxx = expr` assignment. */
const isThisPropertyAssignment = (stmt: any): boolean => {
    if (stmt.type !== 'ExpressionStatement') return false;
    const expr = stmt.expression;
    if (!expr || expr.type !== 'AssignmentExpression') return false;
    const left = expr.left;
    return (
        left &&
        (left.type === 'MemberExpression' || left.type === 'StaticMemberExpression') &&
        left.object?.type === 'ThisExpression'
    );
};

export const noNgOnChangesForDerivedStateRule = createComponentRule(
    'no-ngonchanges-for-derived-state',
    (classNode: AngularClassNode, context: RuleContext): RuleFailure | null => {
        const body = classNode.node.body?.body;
        if (!body) return null;

        for (const member of body) {
            if (member.type !== 'MethodDefinition') continue;
            const method = member as any;

            const methodName = method.key?.type === 'Identifier' ? method.key.name : undefined;
            if (methodName !== 'ngOnChanges') continue;

            const methodBody = method.value?.body;
            if (!methodBody) continue;

            const statements = methodBody.body;
            if (!statements || statements.length === 0) continue;

            // Check: ALL statements are `this.x = ...` assignments (pure derivation)
            const allAreDerived = statements.every(isThisPropertyAssignment);
            if (!allAreDerived) continue;

            const offset = method.start ?? method.span?.start ?? classNode.metadata.decoratorStart;
            const { line, column } = context.locator.location(offset);

            return {
                filePath: context.filePath,
                message: `ngOnChanges() only computes derived state — migrate @Input() properties to input() signals and use computed() instead.`,
                line,
                column,
                severity: 'moderate',
                ruleName: 'no-ngonchanges-for-derived-state',
                fix: RECOMMENDATIONS['no-ngonchanges-for-derived-state'],
            };
        }

        return null;
    }
);
