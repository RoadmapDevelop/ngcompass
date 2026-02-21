/**
 * no-inner-html
 *
 * Disallows direct [innerHTML] and [outerHTML] property bindings in Angular templates.
 *
 * Binding to innerHTML bypasses Angular's built-in XSS sanitisation on the bound
 * expression type level — even though Angular does sanitise at runtime, the pattern
 * signals an intent to render arbitrary HTML. Attackers who control the bound value
 * can inject malicious markup. The safe alternative is to use Angular's DomSanitizer
 * with an explicit trust assertion, or better, restructure the template to avoid
 * raw HTML injection entirely.
 *
 * Priority 1 — Critical security gap
 */

import { createTemplateAttributeRule } from '../engine/rule-handler.js';
import type { TemplateAttributeNode } from '../engine/node-streams.js';
import type { RuleContext, RuleFailure } from '../types.js';
import { RECOMMENDATIONS } from '../recommendations.js';

/** Binding names (lowercased) that trigger this rule. */
const DANGEROUS_BINDINGS = new Set([
    'innerhtml',
    '[innerhtml]',
    'outerhtml',
    '[outerhtml]',
]);

export const noInnerHtmlRule = createTemplateAttributeRule(
    'no-inner-html',
    (node: TemplateAttributeNode, context: RuleContext): RuleFailure | null => {
        const normalised = node.name.toLowerCase().trim();

        if (!DANGEROUS_BINDINGS.has(normalised)) return null;

        const { line, column } = context.locator.location(node.sourceSpan.start);

        return {
            filePath: context.filePath,
            message: `Avoid '${node.name}' binding — it bypasses XSS protection. Use DomSanitizer or restructure the template.`,
            line,
            column,
            severity: 'high',
            ruleName: 'no-inner-html',
            fix: RECOMMENDATIONS['no-inner-html'],
        };
    },
    { requires: { htmlAst: true } }
);
