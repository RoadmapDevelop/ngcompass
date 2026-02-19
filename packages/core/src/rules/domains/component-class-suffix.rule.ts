/**
 * component-class-suffix
 *
 * Enforces that Angular component class names end with the suffix "Component"
 * (or a configured suffix list).
 *
 * Consistent class naming makes it immediately obvious which classes are
 * Angular components at a glance, improves searchability, and aligns with
 * the Angular Style Guide (rule 02-03).
 *
 * Tier P4 — Naming & Conventions (Score: 11, Effort: 25hrs)
 */

import { createComponentRule } from '../engine/rule-handler.js';
import type { AngularClassNode } from '../engine/node-streams.js';
import type { RuleContext, RuleFailure } from '../types.js';
import { RECOMMENDATIONS } from '../recommendations.js';

const DEFAULT_SUFFIXES = ['Component'];

export const componentClassSuffixRule = createComponentRule(
    'component-class-suffix',
    (classNode: AngularClassNode, context: RuleContext): RuleFailure | null => {
        // Only applies to @Component classes
        if (classNode.metadata.type !== 'Component') return null;

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
            ruleName: 'component-class-suffix',
            fix: RECOMMENDATIONS['component-class-suffix'],
        };
    }
);
