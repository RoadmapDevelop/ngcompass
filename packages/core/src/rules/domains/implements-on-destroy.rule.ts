/**
 * implements-on-destroy
 *
 * Enforces that components and directives that define an `ngOnDestroy()`
 * lifecycle method also declare `implements OnDestroy` on the class.
 *
 * Without the interface declaration, TypeScript won't catch typos in the
 * method name (e.g., `ngondestroy`) and tooling loses the connection between
 * the lifecycle hook and the Angular contract.
 *
 * Tier P3 — Code Quality & Safety (Score: 13, Effort: 30hrs)
 */

import { createComponentRule } from '../engine/rule-handler.js';
import type { AngularClassNode } from '../engine/node-streams.js';
import type { RuleContext, RuleFailure } from '../types.js';
import { RECOMMENDATIONS } from '../recommendations.js';

/**
 * Returns true if the class body has a method named ngOnDestroy.
 */
function hasNgOnDestroyMethod(classNode: AngularClassNode): boolean {
    const body = classNode.node.body?.body;
    if (!body) return false;

    for (const member of body) {
        if (member.type !== 'MethodDefinition') continue;
        const method = member as any;
        const keyName = method.key?.type === 'Identifier' ? method.key.name : undefined;
        if (keyName === 'ngOnDestroy') return true;
    }
    return false;
}

/**
 * Returns true if the class implements clause includes OnDestroy.
 */
function implementsOnDestroy(classNode: AngularClassNode): boolean {
    const impl = (classNode.node as any).implements;
    if (!impl || !Array.isArray(impl)) return false;

    for (const clause of impl) {
        // TSClassImplements or similar — check expression name
        const expr = clause.expression ?? clause;
        if (expr?.type === 'Identifier' && expr.name === 'OnDestroy') return true;
        // Could be qualified: core.OnDestroy
        if (
            (expr?.type === 'MemberExpression' || expr?.type === 'TSQualifiedName') &&
            (expr.property?.name === 'OnDestroy' || expr.right?.name === 'OnDestroy')
        ) return true;
    }
    return false;
}

export const implementsOnDestroyRule = createComponentRule(
    'implements-on-destroy',
    (classNode: AngularClassNode, context: RuleContext): RuleFailure | null => {
        if (!hasNgOnDestroyMethod(classNode)) return null;
        if (implementsOnDestroy(classNode)) return null;

        const { line, column } = context.locator.location(classNode.metadata.decoratorStart);

        return {
            filePath: context.filePath,
            message: `Class '${classNode.metadata.className ?? 'Unknown'}' defines 'ngOnDestroy' but is missing 'implements OnDestroy'.`,
            line,
            column,
            severity: 'moderate',
            ruleName: 'implements-on-destroy',
            fix: RECOMMENDATIONS['implements-on-destroy'],
        };
    }
);
