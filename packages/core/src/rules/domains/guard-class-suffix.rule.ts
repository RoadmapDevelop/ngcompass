/**
 * guard-class-suffix
 *
 * Enforces that Angular guard and resolver classes end with "Guard" or "Resolver".
 *
 * Angular guards and resolvers are @Injectable classes that implement one of the
 * following well-known interfaces (detected syntactically from method names):
 *   Guards:    canActivate, canActivateChild, canDeactivate, canLoad, canMatch
 *   Resolvers: resolve
 *
 * When a class exposes any of these methods it should be named accordingly so
 * readers can instantly identify its role without inspecting the route config.
 *
 * Priority 2 — Naming Conventions
 */

import { createAnyAngularClassRule } from '../engine/rule-handler.js';
import type { AnyAngularClassNode } from '../engine/node-streams.js';
import type { RuleContext, RuleFailure } from '../types.js';
import type { MethodDefinition, Identifier } from '../ast/types.js';
import { RECOMMENDATIONS } from '../recommendations.js';

/** Guard lifecycle method names — any of these indicates a guard class. */
const GUARD_METHODS = new Set(['canActivate', 'canActivateChild', 'canDeactivate', 'canLoad', 'canMatch']);

/** Resolver lifecycle method name. */
const RESOLVER_METHODS = new Set(['resolve']);

export const guardClassSuffixRule = createAnyAngularClassRule(
    'guard-class-suffix',
    (classNode: AnyAngularClassNode, context: RuleContext): RuleFailure | null => {
        // Only applies to @Injectable classes
        if (classNode.decoratorName !== 'Injectable') return null;

        const className = classNode.className;
        if (!className) return null;

        const body = classNode.node.body?.body;
        if (!body) return null;

        let isGuard = false;
        let isResolver = false;

        // Detect role by method name (syntactic check, no type resolution needed)
        for (const member of body) {
            if (member.type !== 'MethodDefinition') continue;
            const method = member as MethodDefinition;
            const name = method.key.type === 'Identifier'
                ? (method.key as Identifier).name
                : undefined;

            if (!name) continue;
            if (GUARD_METHODS.has(name)) { isGuard = true; break; }
            if (RESOLVER_METHODS.has(name)) { isResolver = true; break; }
        }

        if (!isGuard && !isResolver) return null;

        const expectedSuffix = isResolver ? 'Resolver' : 'Guard';

        if (className.endsWith(expectedSuffix)) return null;

        const { line, column } = context.locator.location(classNode.decoratorStart);

        return {
            filePath: context.filePath,
            message: `${isResolver ? 'Resolver' : 'Guard'} class '${className}' should end with '${expectedSuffix}'.`,
            line,
            column,
            severity: 'moderate',
            ruleName: 'guard-class-suffix',
            fix: RECOMMENDATIONS['guard-class-suffix'],
        };
    }
);
