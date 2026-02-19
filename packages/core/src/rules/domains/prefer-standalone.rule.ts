/**
 * prefer-standalone
 *
 * Enforces standalone: true on all @Component classes.
 * 18 lines of pure logic, zero allocation.
 */

import { createComponentRule } from '../engine/rule-handler.js';
import type { AngularClassNode } from '../engine/node-streams.js';
import type { RuleContext, RuleFailure } from '../types.js';
import { RECOMMENDATIONS } from '../recommendations.js';

export const preferStandaloneRule = createComponentRule(
    'prefer-standalone',
    (classNode: AngularClassNode, context: RuleContext): RuleFailure | null => {
        const standalone = classNode.metadata.standalone;

        // Already standalone: true? Pass.
        if (standalone.kind === 'literal' && standalone.value === true) return null;

        // Non-literal? Skip.
        if (standalone.kind === 'non-literal') return null;

        // Missing or false? Report.
        const { line, column } = context.locator.location(classNode.metadata.decoratorStart);

        return {
            filePath: context.filePath,
            message: `Component '${classNode.metadata.className ?? 'Unknown'}' should be standalone`,
            line,
            column,
            severity: 'critical',
            ruleName: 'prefer-standalone',
            fix: RECOMMENDATIONS['prefer-standalone'],
        };
    }
);
