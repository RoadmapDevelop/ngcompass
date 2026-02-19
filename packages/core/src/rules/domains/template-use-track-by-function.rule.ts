/**
 * template-use-track-by-function
 *
 * Enforces use of trackBy with *ngFor and track with @for.
 * Without trackBy/track, Angular re-renders all DOM elements
 * on every change detection cycle, causing performance degradation
 * in lists.
 */

import { createTemplateAttributeRule } from '../engine/rule-handler.js';
import type { TemplateAttributeNode } from '../engine/node-streams.js';
import type { RuleContext, RuleFailure } from '../types.js';
import { RECOMMENDATIONS } from '../recommendations.js';

/**
 * Stateful tracker for *ngFor attributes in a single template analysis.
 *
 * The template analyzer emits each attribute independently.
 * For *ngFor="let item of items; trackBy: trackFn" the value contains "trackBy:".
 * We check the value string for trackBy presence.
 */
export const templateUseTrackByFunctionRule = createTemplateAttributeRule(
    'template-use-track-by-function',
    (node: TemplateAttributeNode, context: RuleContext): RuleFailure | null => {
        // Check for *ngFor without trackBy
        if (node.name === '*ngFor') {
            const value = node.value ?? '';

            // Check if trackBy is specified in the microsyntax.
            // Use regex to match the Angular microsyntax keyword "trackBy" preceded by
            // a semicolon (or start of value) and followed by colon, avoiding false
            // positives from variable names like "trackByItem".
            if (!/(?:^|;)\s*trackBy\s*:/.test(value)) {
                const { line, column } = context.locator.location(node.sourceSpan.start);

                return {
                    filePath: context.filePath,
                    message: `*ngFor is missing a trackBy function. Add 'trackBy: yourTrackFn' to improve rendering performance.`,
                    line,
                    column,
                    severity: 'moderate',
                    ruleName: 'template-use-track-by-function',
                    fix: RECOMMENDATIONS['template-use-track-by-function'],
                };
            }
        }

        // Check for [ngForTrackBy] binding (verbose syntax) - this is valid, no report
        // The attribute [ngForTrackBy]="fn" means trackBy is present.

        return null;
    },
    {
        requires: {
            htmlAst: true,
        }
    }
);
