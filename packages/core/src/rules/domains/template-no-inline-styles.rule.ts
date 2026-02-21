/**
 * template-no-inline-styles
 *
 * Disallows [ngStyle] directive bindings and [style] object bindings in templates.
 *
 * Inline style bindings couple presentation logic into the template, making
 * themes, responsive design, and design system adoption harder. Individual
 * property bindings like [style.color] are permitted — they are often
 * necessary for dynamic values. The flagged patterns ([ngStyle] and [style]
 * with an object expression) typically indicate that CSS classes would be a
 * cleaner solution.
 *
 * Priority 3 — Template Coverage
 */

import { createTemplateAttributeRule } from '../engine/rule-handler.js';
import type { TemplateAttributeNode } from '../engine/node-streams.js';
import type { RuleContext, RuleFailure } from '../types.js';
import { RECOMMENDATIONS } from '../recommendations.js';

export const templateNoInlineStylesRule = createTemplateAttributeRule(
    'template-no-inline-styles',
    (node: TemplateAttributeNode, context: RuleContext): RuleFailure | null => {
        const name = node.name.trim();

        // Flag [ngStyle] directive — replace with host class bindings or CSS classes
        const isNgStyle = name === 'ngStyle' || name === '[ngStyle]';

        // Flag [style] object binding — [style.color] individual bindings are fine
        // [style] binds the entire style object, which is the problematic pattern
        const isStyleObject = name === '[style]';

        if (!isNgStyle && !isStyleObject) return null;

        const { line, column } = context.locator.location(node.sourceSpan.start);

        return {
            filePath: context.filePath,
            message: `Avoid '${name}' — use CSS classes and [class] bindings to keep styles in stylesheets.`,
            line,
            column,
            severity: 'low',
            ruleName: 'template-no-inline-styles',
            fix: RECOMMENDATIONS['template-no-inline-styles'],
        };
    },
    { requires: { htmlAst: true } }
);
