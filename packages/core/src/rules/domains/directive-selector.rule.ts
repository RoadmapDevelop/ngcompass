/**
 * directive-selector
 *
 * Enforces naming conventions for directive selectors.
 * By default, Angular directives should use:
 * - camelCase attribute selectors (e.g., '[appMyDirective]')
 * - A configured prefix (e.g., 'app')
 *
 * This prevents selector collisions with native HTML attributes
 * and third-party libraries, and maintains consistency across
 * the codebase.
 *
 * Configurable via options:
 *   prefix: string | string[] (default: 'app')
 *   type: 'attribute' | 'element' | 'any' (default: 'attribute')
 */

import { createComponentRule } from '../engine/rule-handler.js';
import type { AngularClassNode } from '../engine/node-streams.js';
import type { RuleContext, RuleFailure } from '../types.js';

const DEFAULT_PREFIX = 'app';
const CAMEL_CASE_REGEX = /^[a-z][a-zA-Z0-9]*$/;
const KEBAB_CASE_REGEX = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

export const directiveSelectorRule = createComponentRule(
    'directive-selector',
    (classNode: AngularClassNode, context: RuleContext): RuleFailure | null => {
        // Only run on directives
        if (classNode.metadata.type !== 'Directive') return null;

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
        const selectorType = (options['type'] as string) ?? 'attribute';

        // Parse multiple selectors (comma-separated, e.g., 'app-foo, [appFoo]')
        const selectors = selectorValue.split(',').map((s: string) => s.trim());

        for (const sel of selectors) {
            if (!sel) continue;

            // Parse selector: my-element, [myAttr], element[myAttr]
            const attributeMatch = sel.match(/^([^\[]*)\[([^\]]+)\]$/);
            const isAttribute = !!attributeMatch;
            const elementPart = attributeMatch?.[1] || '';
            const cleanSelector = attributeMatch?.[2] || sel;

            // Type check
            if (selectorType === 'element' && isAttribute) {
                return buildFailure(
                    classNode, context,
                    `Directive '${classNode.metadata.className ?? 'Unknown'}' should use an element selector instead of attribute selector '${sel}'.`
                );
            }

            if (selectorType === 'attribute' && !isAttribute) {
                return buildFailure(
                    classNode, context,
                    `Directive '${classNode.metadata.className ?? 'Unknown'}' should use an attribute selector instead of element selector '${sel}'.`
                );
            }

            // Prefix check
            const hasValidPrefix = prefixes.some(prefix => {
                if (!prefix) return true;
                return cleanSelector.startsWith(prefix);
            });

            if (!hasValidPrefix) {
                const prefixList = prefixes.length > 1
                    ? `one of: '${prefixes.join("', '")}'`
                    : `'${prefixes[0]}'`;

                return buildFailure(
                    classNode, context,
                    `Directive selector '${sel}' should start with prefix ${prefixList} (e.g., '[${prefixes[0]}MyDirective]').`
                );
            }

            // Case check
            if (isAttribute) {
                if (!CAMEL_CASE_REGEX.test(cleanSelector)) {
                    return buildFailure(
                        classNode, context,
                        `Directive attribute selector '${cleanSelector}' should be camelCase (e.g., '[${prefixes[0] || 'app'}MyDirective]').`
                    );
                }
                if (elementPart && !KEBAB_CASE_REGEX.test(elementPart)) {
                    return buildFailure(
                        classNode, context,
                        `Directive element restriction '${elementPart}' should be kebab-case (e.g., 'ng-template').`
                    );
                }
            } else {
                if (!KEBAB_CASE_REGEX.test(cleanSelector)) {
                    return buildFailure(
                        classNode, context,
                        `Directive element selector '${sel}' should be kebab-case (e.g., '${prefixes[0] || 'app'}-my-directive').`
                    );
                }
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
        severity: 'high',
        ruleName: 'directive-selector',
    };
};
