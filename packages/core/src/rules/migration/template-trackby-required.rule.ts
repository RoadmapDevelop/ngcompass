import { createTemplateAttributeRule } from '../engine/rule-handler.js';
import type { TemplateAttributeNode } from '../engine/node-streams.js';
import type { RuleContext, RuleFailure } from '../types.js';
import { RECOMMENDATIONS } from '../recommendations.js';

/**
 * template-trackby-required-for-ngfor
 *
 * Detects *ngFor structural directives missing a trackBy function.
 * Without trackBy, Angular must recreate the entire DOM for the list on every change.
 *
 * Note: { requires: { htmlAst: true } } is required so the task planner sets
 * needsAst:true on this rule's task, ensuring the HTML template is loaded and
 * parsed even when no other htmlAst rule is in the same batch.
 */
export const templateTrackByRequiredRule = createTemplateAttributeRule(
    'template-trackby-required-for-ngfor',
    (node: TemplateAttributeNode, context: RuleContext): RuleFailure | null => {
        // Only target *ngFor
        if (node.name !== '*ngFor') {
            return null;
        }

        const value = node.value ?? '';

        // Check for trackBy: within the micro-syntax
        // Matches "trackBy:" with optional whitespace
        const hasTrackBy = /trackBy\s*:/.test(value);

        if (!hasTrackBy) {
            const templateOffset = context.template?.templateStartOffset ?? 0;
            const { line, column } = context.locator.location(node.sourceSpan.start + templateOffset);

            return {
                filePath: context.filePath,
                ruleName: 'template-trackby-required-for-ngfor',
                message: 'Usage of *ngFor without a trackBy function is discouraged for performance reasons.',
                line,
                column,
                severity: 'high',
                fix: RECOMMENDATIONS['template-trackby-required-for-ngfor'],
            };
        }

        return null;
    },
    {
        requires: { htmlAst: true }
    }
);
