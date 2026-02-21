/**
 * no-empty-lifecycle-method
 *
 * Disallows empty Angular lifecycle hook method implementations.
 *
 * An empty ngOnInit() {} or ngOnDestroy() {} serves no purpose and adds
 * noise to the class. Empty hooks are often left behind after refactoring,
 * misleading readers into thinking logic exists where there is none.
 * Remove them — Angular handles absent hooks gracefully.
 *
 * Tier P3 — Code Quality & Safety (Score: 11, Effort: 25hrs)
 */

import { createComponentRule } from '../engine/rule-handler.js';
import type { AngularClassNode } from '../engine/node-streams.js';
import type { RuleContext, RuleFailure } from '../types.js';
import { RECOMMENDATIONS } from '../recommendations.js';

const LIFECYCLE_HOOKS = new Set([
    'ngOnChanges',
    'ngOnInit',
    'ngDoCheck',
    'ngAfterContentInit',
    'ngAfterContentChecked',
    'ngAfterViewInit',
    'ngAfterViewChecked',
    'ngOnDestroy',
]);

/**
 * Returns true if the method body has zero statements (or only a single
 * empty statement / comment — we treat any empty block as empty).
 */
function isBodyEmpty(method: any): boolean {
    const body = method.value?.body ?? method.body;
    if (!body) return true;
    if (body.type !== 'BlockStatement') return false;
    const stmts = body.body ?? [];
    // Allow a single comment-only block by checking statement count
    return stmts.length === 0;
}

export const noEmptyLifecycleMethodRule = createComponentRule(
    'no-empty-lifecycle-method',
    (classNode: AngularClassNode, context: RuleContext): RuleFailure[] | null => {
        const body = classNode.node.body?.body;
        if (!body) return null;

        const failures: RuleFailure[] = [];

        for (const member of body) {
            if (member.type !== 'MethodDefinition') continue;
            const method = member as any;
            const name: string | undefined = method.key?.type === 'Identifier' ? method.key.name : undefined;
            if (!name || !LIFECYCLE_HOOKS.has(name)) continue;
            if (!isBodyEmpty(method)) continue;

            const offset = method.start ?? method.span?.start ?? classNode.metadata.decoratorStart;
            const { line, column } = context.locator.location(offset);

            failures.push({
                filePath: context.filePath,
                message: `Remove empty lifecycle method '${name}'.`,
                line,
                column,
                severity: 'low',
                ruleName: 'no-empty-lifecycle-method',
                fix: RECOMMENDATIONS['no-empty-lifecycle-method'],
            });
        }

        return failures.length > 0 ? failures : null;
    }
);
