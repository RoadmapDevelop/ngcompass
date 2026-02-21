/**
 * service-class-suffix
 *
 * Enforces that Angular service class names end with the suffix "Service"
 * (or a configured suffix list).
 *
 * @Injectable classes used as services form the backbone of Angular's DI
 * system. Consistent naming makes them immediately identifiable, aligns with
 * the Angular Style Guide (rule 02-04), and improves code searchability.
 *
 * Note: This rule applies to all @Injectable classes. If you use @Injectable
 * on classes that are not services (e.g. guards, resolvers, interceptors),
 * configure the `suffixes` option to include their expected suffixes, or
 * disable the rule for those files.
 *
 * Priority 2 — Naming Conventions
 */

import { createAnyAngularClassRule } from '../engine/rule-handler.js';
import type { AnyAngularClassNode } from '../engine/node-streams.js';
import type { RuleContext, RuleFailure } from '../types.js';
import { RECOMMENDATIONS } from '../recommendations.js';

const DEFAULT_SUFFIXES = ['Service', 'Guard', 'Resolver', 'Interceptor', 'Store'];

export const serviceClassSuffixRule = createAnyAngularClassRule(
    'service-class-suffix',
    (classNode: AnyAngularClassNode, context: RuleContext): RuleFailure | null => {
        // Only applies to @Injectable classes
        if (classNode.decoratorName !== 'Injectable') return null;

        const className = classNode.className;
        if (!className) return null;

        const options = context.options ?? {};
        const suffixes: string[] = Array.isArray(options['suffixes'])
            ? (options['suffixes'] as string[])
            : DEFAULT_SUFFIXES;

        const hasSuffix = suffixes.some(suffix => className.endsWith(suffix));
        if (hasSuffix) return null;

        const suffixList = suffixes.length === 1
            ? `'${suffixes[0]}'`
            : `one of: ${suffixes.map(s => `'${s}'`).join(', ')}`;

        const { line, column } = context.locator.location(classNode.decoratorStart);

        return {
            filePath: context.filePath,
            message: `Injectable class '${className}' should end with ${suffixList}.`,
            line,
            column,
            severity: 'moderate',
            ruleName: 'service-class-suffix',
            fix: RECOMMENDATIONS['service-class-suffix'],
        };
    }
);
