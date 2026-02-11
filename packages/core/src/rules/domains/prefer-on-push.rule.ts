/**
 * prefer-on-push-component-change-detection
 *
 * BEFORE: 307 lines (manual traversal, parsing)
 * AFTER: 20 lines (pure logic, zero allocation)
 */

import { createComponentRule } from '../engine/rule-handler.js';
import { ChangeDetectionStrategy } from '../analyzers/component-analyzer.js';
import type { AngularComponentNode } from '../engine/node-streams.js';
import type { RuleContext, RuleFailure } from '../types.js';
import { Locator } from '../../utils/locator.js';

export const preferOnPushRule = createComponentRule(
    'prefer-on-push-component-change-detection',
    (componentNode: AngularComponentNode, context: RuleContext): RuleFailure | null => {
        const cd = componentNode.metadata.changeDetection;

        // Already OnPush? Pass.
        if (cd.kind === 'literal' && cd.value === ChangeDetectionStrategy.OnPush) return null;

        // Non-literal? Skip (can't verify).
        if (cd.kind === 'non-literal') return null;

        // Missing or Default? Report.
        const locator = new Locator(context.fileContent);
        const { line, column } = locator.location(componentNode.metadata.decoratorStart);

        return {
            filePath: context.filePath,
            message: `Component '${componentNode.metadata.className ?? 'Unknown'}' should use ChangeDetectionStrategy.OnPush`,
            line,
            column,
            severity: 'critical',
            ruleName: 'prefer-on-push-component-change-detection',
        };
    }
);
