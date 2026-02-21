/**
 * pipe-class-suffix
 *
 * Enforces that Angular pipe class names end with the suffix "Pipe"
 * (or a configured suffix list).
 *
 * Consistent naming makes it immediately obvious which classes are pipes,
 * improves IDE discoverability, and aligns with the Angular Style Guide.
 * Parallels component-class-suffix and directive-class-suffix.
 *
 * Priority 2 — Naming Conventions
 */

import { createAnyAngularClassRule } from '../engine/rule-handler.js';
import type { AnyAngularClassNode } from '../engine/node-streams.js';
import type { RuleContext, RuleFailure } from '../types.js';
import { RECOMMENDATIONS } from '../recommendations.js';

const DEFAULT_SUFFIXES = ['Pipe'];

export const pipeClassSuffixRule = createAnyAngularClassRule(
    'pipe-class-suffix',
    (classNode: AnyAngularClassNode, context: RuleContext): RuleFailure | null => {
        // Only applies to @Pipe classes
        if (classNode.decoratorName !== 'Pipe') return null;

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
            message: `Pipe class '${className}' should end with ${suffixList}.`,
            line,
            column,
            severity: 'moderate',
            ruleName: 'pipe-class-suffix',
            fix: RECOMMENDATIONS['pipe-class-suffix'],
        };
    }
);
