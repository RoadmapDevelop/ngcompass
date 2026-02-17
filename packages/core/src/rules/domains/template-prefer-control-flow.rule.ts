/**
 * template-prefer-control-flow
 *
 * Enforces modern Angular control flow syntax (@if, @for, @switch)
 * over legacy structural directives (*ngIf, *ngFor, etc.).
 */

import { createTemplateAttributeRule } from '../engine/rule-handler.js';
import type { TemplateAttributeNode } from '../engine/node-streams.js';
import type { RuleContext, RuleFailure } from '../types.js';

const LEGACY_DIRECTIVES = new Set([
    '*ngIf',
    '*ngFor',
    '*ngForOf',
    '*ngSwitch',
    '*ngSwitchCase',
    '*ngSwitchDefault'
]);

export const templatePreferControlFlowRule = createTemplateAttributeRule(
    'template-prefer-control-flow',
    (node: TemplateAttributeNode, context: RuleContext): RuleFailure | null => {
        if (LEGACY_DIRECTIVES.has(node.name)) {
            const { line, column } = context.locator.location(node.sourceSpan.start);

            return {
                filePath: context.filePath,
                message: `Use modern control flow (@if, @for, @switch) instead of legacy structural directive '${node.name}' for better performance and readability.`,
                line,
                column,
                severity: 'high',
                ruleName: 'template-prefer-control-flow',
            };
        }

        return null;
    },
    {
        requires: {
            htmlAst: true,
        }
    }
);
