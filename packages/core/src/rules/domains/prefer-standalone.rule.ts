/**
 * prefer-standalone
 *
 * Enforces standalone: true on all @Component classes.
 * 18 lines of pure logic, zero allocation.
 */

import { createComponentRule } from '../engine/rule-handler.js';
import type { AngularComponentNode } from '../engine/node-streams.js';
import type { RuleContext, RuleFailure } from '../types.js';
import { Locator } from '../../utils/locator.js';

export const preferStandaloneRule = createComponentRule(
    'prefer-standalone',
    (componentNode: AngularComponentNode, context: RuleContext): RuleFailure | null => {
        const standalone = componentNode.metadata.standalone;

        // Already standalone: true? Pass.
        if (standalone.kind === 'literal' && standalone.value === true) return null;

        // Non-literal? Skip.
        if (standalone.kind === 'non-literal') return null;

        // Missing or false? Report.
        const locator = new Locator(context.fileContent);
        const { line, column } = locator.location(componentNode.metadata.decoratorStart);

        return {
            filePath: context.filePath,
            message: `Component '${componentNode.metadata.className ?? 'Unknown'}' should be standalone`,
            line,
            column,
            severity: 'critical',
            ruleName: 'prefer-standalone',
        };
    }
);
