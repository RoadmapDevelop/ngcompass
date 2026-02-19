/**
 * directive-class-suffix
 *
 * Enforces that Angular directive class names end with the suffix "Directive"
 * (or a configured suffix list).
 *
 * Consistent naming makes directives immediately identifiable without
 * reading the decorator, improves tooling discoverability, and follows
 * the Angular Style Guide (rule 02-03).
 *
 * Tier P4 — Naming & Conventions (Score: 11, Effort: 25hrs)
 */

import { createComponentRule } from '../engine/rule-handler.js';
import type { AngularClassNode } from '../engine/node-streams.js';
import type { RuleContext, RuleFailure } from '../types.js';
import { RECOMMENDATIONS } from '../recommendations.js';

const DEFAULT_SUFFIXES = ['Directive'];

export const directiveClassSuffixRule = createComponentRule(
    'directive-class-suffix',
    (classNode: AngularClassNode, context: RuleContext): RuleFailure | null => {
        // Only applies to @Directive classes (not @Component, which extends Directive)
        if (classNode.metadata.type !== 'Directive') return null;

        const className = classNode.metadata.className;
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

        const { line, column } = context.locator.location(classNode.metadata.decoratorStart);

        return {
            filePath: context.filePath,
            message: `Class '${className}' should end with ${suffixList}.`,
            line,
            column,
            severity: 'moderate',
            ruleName: 'directive-class-suffix',
            fix: RECOMMENDATIONS['directive-class-suffix'],
        };
    }
);
