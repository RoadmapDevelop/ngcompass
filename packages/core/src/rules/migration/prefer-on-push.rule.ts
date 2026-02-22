import { createComponentRule } from '../engine/rule-handler.js';
import { ChangeDetectionStrategy } from '../analyzers/component-analyzer.js';
import type { AngularClassNode } from '../engine/node-streams.js';
import type { RuleContext, RuleFailure } from '../types.js';
import { RECOMMENDATIONS } from '../recommendations.js';

/**
 * EVALUATION:
 * Your Tri-State Analyzer ensures this rule runs at O(1) complexity.
 * Since 'extractChangeDetection' handles both MemberExpressions and Identifiers,
 * this rule is robust against different import styles.
 */
export const preferOnPushRule = createComponentRule(
    'prefer-on-push-component-change-detection',
    (classNode: AngularClassNode, context: RuleContext): RuleFailure | null => {
        const { metadata } = classNode;

        // Skip Directives - they don't have ChangeDetectionStrategy
        if (metadata.type !== 'Component') return null;

        const cd = metadata.changeDetection;

        // 1. Semantic Guard (Using your Tri-State logic)
        // - kind: 'literal' && value: OnPush => Already optimized, skip.
        // - kind: 'non-literal' => Dynamic value, skip to avoid false positives.
        if (cd.kind === 'non-literal' || (cd.kind === 'literal' && cd.value === ChangeDetectionStrategy.OnPush)) {
            return null;
        }

        // 2. Report for 'missing' (Default) or 'literal' (explicit Default)
        // We use metadata.decoratorStart because MetadataValue doesn't carry 
        // the specific property node in your current implementation.
        const { line, column } = context.locator.location(metadata.decoratorStart);

        return {
            filePath: context.filePath,
            ruleName: 'prefer-on-push-component-change-detection',
            message: `Component '${metadata.className ?? 'AnonymousComponent'}' should use ChangeDetectionStrategy.OnPush.`,
            line,
            column,
            severity: 'critical',
            fix: RECOMMENDATIONS['prefer-on-push-component-change-detection'],
        };
    }
);