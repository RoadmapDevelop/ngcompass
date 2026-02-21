/**
 * rxjs-no-subject-value
 *
 * Disallows accessing the `.value` property on BehaviorSubject instances.
 *
 * `BehaviorSubject.value` is a synchronous getter that imperatively reads the
 * current value of the subject. This pattern:
 *   - Encourages imperative "pull" thinking instead of reactive "push" patterns
 *   - Creates invisible temporal couplings (the value may change after reading)
 *   - Bypasses the reactive graph, making derived state stale
 *
 * Prefer subscribing or using `pipe(take(1))` to get the current value in a
 * reactive way, or use a signal-based store instead.
 *
 * Detection strategy:
 *   1. Collect class properties initialised with `new BehaviorSubject(...)`.
 *   2. Flag any `this.<collectedProperty>.value` member access in the class body.
 *
 * Priority 5 — RxJS Safety
 */

import { createComponentRule } from '../engine/rule-handler.js';
import type { AngularClassNode } from '../engine/node-streams.js';
import type { RuleContext, RuleFailure } from '../types.js';
import { walkProgram } from '../visitor.js';
import { RECOMMENDATIONS } from '../recommendations.js';

/**
 * Collects names of properties initialised with `new BehaviorSubject(…)` or
 * `new ReplaySubject(…)` — the only two Subject types that expose `.value`.
 */
const collectSubjectProperties = (classBody: any): Set<string> => {
    const names = new Set<string>();
    const members = classBody.body;
    if (!members) return names;

    for (const member of members) {
        if (member.type !== 'PropertyDefinition') continue;
        const keyName = member.key?.type === 'Identifier' ? member.key.name : undefined;
        if (!keyName) continue;

        const init = member.value;
        if (!init || init.type !== 'NewExpression') continue;

        const callee = init.callee;
        const className = callee?.type === 'Identifier' ? callee.name : undefined;

        if (className === 'BehaviorSubject' || className === 'ReplaySubject') {
            names.add(keyName);
        }
    }

    return names;
};

export const rxjsNoSubjectValueRule = createComponentRule(
    'rxjs-no-subject-value',
    (classNode: AngularClassNode, context: RuleContext): RuleFailure[] | null => {
        const classBody = classNode.node.body;
        if (!classBody) return null;

        // Phase 1: find BehaviorSubject/ReplaySubject property names
        const subjectProps = collectSubjectProperties(classBody);
        if (subjectProps.size === 0) return null;

        const failures: RuleFailure[] = [];

        // Phase 2: find `this.<subjectProp>.value` access
        walkProgram(classBody, (node) => {
            if (node.type !== 'MemberExpression' && node.type !== 'StaticMemberExpression') return;

            const prop = node.property;
            if (!prop || prop.type !== 'Identifier' || prop.name !== 'value') return;

            // object must be `this.xxx`
            const obj = node.object;
            if (!obj) return;
            if (obj.type !== 'MemberExpression' && obj.type !== 'StaticMemberExpression') return;

            if (obj.object?.type !== 'ThisExpression') return;

            const subjectName = obj.property?.type === 'Identifier' ? obj.property.name : undefined;
            if (!subjectName || !subjectProps.has(subjectName)) return;

            const offset = node.start ?? node.span?.start ?? classNode.metadata.decoratorStart;
            const { line, column } = context.locator.location(offset);

            failures.push({
                filePath: context.filePath,
                message: `Avoid '${subjectName}.value' — use pipe(take(1)) or subscribe() to read the current value reactively.`,
                line,
                column,
                severity: 'moderate',
                ruleName: 'rxjs-no-subject-value',
                fix: RECOMMENDATIONS['rxjs-no-subject-value'],
            });
        });

        return failures.length > 0 ? failures : null;
    }
);
