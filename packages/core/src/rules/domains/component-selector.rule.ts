/**
 * component-selector
 *
 * Enforces naming conventions for component selectors.
 * By default, Angular components should use:
 * - kebab-case element selectors (e.g., 'app-my-component')
 * - A configured prefix (e.g., 'app')
 *
 * This prevents selector collisions with native HTML elements
 * and third-party libraries, and maintains consistency across
 * the codebase.
 *
 * Configurable via options:
 *   prefix: string | string[] (default: 'app')
 *   type: 'element' | 'attribute' | 'any' (default: 'element')
 */

import { createComponentRule } from '../engine/rule-handler.js';
import type { AngularClassNode } from '../engine/node-streams.js';
import type { RuleContext, RuleFailure } from '../types.js';
import { RECOMMENDATIONS } from '../recommendations.js';

const DEFAULT_PREFIX = 'app';
const KEBAB_CASE_REGEX = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

export const componentSelectorRule = createComponentRule(
    'component-selector',
    (classNode: AngularClassNode, context: RuleContext): RuleFailure | null => {
        // Only run on components
        if (classNode.metadata.type !== 'Component') return null;

        const selector = classNode.metadata.selector;

        // No selector or non-literal? Skip.
        if (selector.kind !== 'literal') return null;

        const selectorValue = selector.value;

        // Get configured prefixes (default: 'app')
        const options = context.options ?? {};
        const prefixOption = options['prefix'] ?? DEFAULT_PREFIX;
        const prefixes: string[] = Array.isArray(prefixOption)
            ? prefixOption as string[]
            : [prefixOption as string];
        const selectorType = (options['type'] as string) ?? 'element';

        // Parse multiple selectors (comma-separated, e.g., 'app-foo, [appFoo]')
        const selectors = selectorValue.split(',').map((s: string) => s.trim());

        for (const sel of selectors) {
            if (!sel) continue;

            // Determine if this is an attribute selector [attr] or element selector
            const isAttribute = sel.startsWith('[') && sel.endsWith(']');
            const cleanSelector = isAttribute ? sel.slice(1, -1) : sel;

            // Type check
            if (selectorType === 'element' && isAttribute) {
                return buildFailure(
                    classNode, context,
                    `Use element selector instead of attribute '${sel}'.`
                );
            }

            if (selectorType === 'attribute' && !isAttribute) {
                return buildFailure(
                    classNode, context,
                    `Use attribute selector instead of element '${sel}'.`
                );
            }

            // Prefix check
            const hasValidPrefix = prefixes.some(prefix => {
                if (!prefix) return true; // Empty prefix means no prefix required
                return cleanSelector.startsWith(prefix);
            });

            if (!hasValidPrefix) {
                const prefixList = prefixes.length > 1
                    ? `one of: '${prefixes.join("', '")}'`
                    : `'${prefixes[0]}'`;

                return buildFailure(
                    classNode, context,
                    `Selector '${sel}' should start with prefix ${prefixList}.`
                );
            }

            // Kebab-case check for element selectors
            if (!isAttribute && !KEBAB_CASE_REGEX.test(cleanSelector)) {
                return buildFailure(
                    classNode, context,
                    `Selector '${sel}' should be kebab-case.`
                );
            }
        }

        return null;
    }
);

const buildFailure = (
    classNode: AngularClassNode,
    context: RuleContext,
    message: string
): RuleFailure => {
    const { line, column } = context.locator.location(classNode.metadata.decoratorStart);

    return {
        filePath: context.filePath,
        message,
        line,
        column,
        severity: 'moderate',
        ruleName: 'component-selector',
        fix: RECOMMENDATIONS['component-selector'],
    };
};
