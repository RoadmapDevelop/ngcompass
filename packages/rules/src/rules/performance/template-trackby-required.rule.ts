import { TemplateAttributeNode, TemplateBlockNode, TemplateAnalysis } from '@ngcompass/ast';
import { RuleContext, RuleFailure } from '@ngcompass/common';
import {
    createTemplateRule,
} from '@ngcompass/engine';

import { RECOMMENDATIONS } from '../../recommendations';

const NGFOR_RULE_NAME = 'template-trackby-required-for-ngfor';
const ATFOR_RULE_NAME = 'template-track-required-for-atfor';
const COMBINED_RULE_NAME = 'template-trackby-required';

const NGFOR_MESSAGE =
    'Add a trackBy function to *ngFor to reduce unnecessary DOM updates for dynamic lists.';

const ATFOR_MESSAGE =
    'Add a track expression to @for to reduce unnecessary DOM updates for dynamic lists.';

function getTemplateAbsoluteOffset(
    context: RuleContext,
    node: TemplateAttributeNode | TemplateBlockNode,
): number {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const templateStartOffset = (context as any).template?.templateStartOffset;

    if (typeof templateStartOffset === 'number' && Number.isFinite(templateStartOffset)) {
        return node.sourceSpan.start + templateStartOffset;
    }

    return node.sourceSpan.start;
}

function createFailure(
    context: RuleContext,
    node: TemplateAttributeNode | TemplateBlockNode,
    ruleName: string,
    message: string,
): RuleFailure {
    const offset = getTemplateAbsoluteOffset(context, node);
    const { line, column } = context.locator.location(offset);

    return {
        filePath: context.filePath,
        ruleName,
        message,
        line,
        column,
        severity: 'error',
        fix: RECOMMENDATIONS[ruleName],
    };
}

function hasNonEmptyTrackBy(microsyntax: string): boolean {
    const match = microsyntax.match(/\btrackBy\s*:\s*([^;]+?)\s*(?:;|$)/);
    return !!match?.[1]?.trim();
}

function hasNonEmptyForTrack(node: TemplateBlockNode): boolean {
    return node.parameters.some((param) => {
        const expression = param.expression?.trim() ?? '';
        if (!expression) {
            return false;
        }

        if (!/^track\b/.test(expression)) {
            return false;
        }

        return expression.replace(/^track\b/, '').trim().length > 0;
    });
}

export const templateTrackByRequiredRule = createTemplateRule(
    COMBINED_RULE_NAME,
    (analysis: TemplateAnalysis, context: RuleContext): RuleFailure[] | null => {
        const failures: RuleFailure[] = [];

        // Check *ngFor (attributes)
        for (const node of analysis.attributes) {
            if (node.name === '*ngFor') {
                const value = node.value ?? '';
                if (!hasNonEmptyTrackBy(value)) {
                    failures.push(createFailure(context, node, NGFOR_RULE_NAME, NGFOR_MESSAGE));
                }
            }
        }

        // Check @for (blocks)
        for (const node of analysis.blocks) {
            if (node.name === 'for') {
                if (!hasNonEmptyForTrack(node)) {
                    failures.push(createFailure(context, node, ATFOR_RULE_NAME, ATFOR_MESSAGE));
                }
            }
        }

        return failures.length > 0 ? failures : null;
    },
    {
        requires: { htmlAst: true },
    },
);