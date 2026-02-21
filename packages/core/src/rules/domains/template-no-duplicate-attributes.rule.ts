/**
 * template-no-duplicate-attributes
 *
 * Disallows duplicate attributes on the same HTML element in Angular templates.
 *
 * Duplicate attributes are a DOM validation error — the browser silently
 * discards all but the first occurrence, making the second binding
 * effectively dead code. Angular's compiler may also warn but won't always
 * prevent the issue.
 *
 * Tier P3 — Code Quality & Safety (Score: 12, Effort: 30hrs)
 */

import { createTemplateAttributeRule } from '../engine/rule-handler.js';
import type { TemplateAttributeNode } from '../engine/node-streams.js';
import type { RuleContext, RuleFailure } from '../types.js';
import { RECOMMENDATIONS } from '../recommendations.js';

/**
 * Tracks seen attribute names per element.
 *
 * The template analyzer emits attributes one-by-one. We maintain a Map
 * keyed by a "scope key" derived from the attribute's position in the file
 * — attributes on the same element share the same opening tag offset.
 *
 * Since the template attribute stream doesn't carry element context, we use
 * a file-scoped WeakMap-equivalent (plain Map cleared per file) heuristic:
 * track (elementStartOffset → Set<attributeName>).
 *
 * Note: This is a best-effort detection. The template parser's sourceSpan
 * provides the attribute start; elements share a common "enclosing" span.
 */

// Module-level state cleared on each rule invocation via a fresh closure.
// Each rule call gets a fresh Map since createTemplateAttributeRule creates
// a new handler per rule registration.
const seenPerElement = new Map<number, Set<string>>();
let lastFilePath = '';

function getElementKey(node: TemplateAttributeNode): number {
    // Heuristic: attributes on the same element have sourceSpan.start values
    // that are close together. We bucket by the nearest 500-char boundary,
    // which is wide enough to cover typical element opening tags.
    return Math.floor(node.sourceSpan.start / 500) * 500;
}

export const templateNoDuplicateAttributesRule = createTemplateAttributeRule(
    'template-no-duplicate-attributes',
    (node: TemplateAttributeNode, context: RuleContext): RuleFailure | null => {
        // Reset state when file changes
        if (context.filePath !== lastFilePath) {
            seenPerElement.clear();
            lastFilePath = context.filePath;
        }

        const elementKey = getElementKey(node);
        let seen = seenPerElement.get(elementKey);
        if (!seen) {
            seen = new Set<string>();
            seenPerElement.set(elementKey, seen);
        }

        // Normalise attribute name: strip Angular binding brackets/parens
        const normName = node.name
            .replace(/^\[+/, '')
            .replace(/\]+$/, '')
            .replace(/^\(+/, '')
            .replace(/\)+$/, '')
            .trim();

        if (seen.has(normName)) {
            const { line, column } = context.locator.location(node.sourceSpan.start);
            return {
                filePath: context.filePath,
                message: `Duplicate attribute '${node.name}' on element.`,
                line,
                column,
                severity: 'high',
                ruleName: 'template-no-duplicate-attributes',
                fix: RECOMMENDATIONS['template-no-duplicate-attributes'],
            };
        }

        seen.add(normName);
        return null;
    },
    { requires: { htmlAst: true } }
);
