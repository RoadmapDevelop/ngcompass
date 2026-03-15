import { TemplateAttributeNode } from "@ngcompass/ast";
import { RuleFailure } from "@ngcompass/common";
import { createTemplateAttributeRule } from '@ngcompass/engine';
import { RECOMMENDATIONS } from "../../recommendations";
import { RuleContext } from "@ngcompass/common";


function getTemplateAbsoluteOffset(context: RuleContext, node: TemplateAttributeNode): number {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const templateStartOffset = (context as any).template?.templateStartOffset;
    if (typeof templateStartOffset === 'number' && Number.isFinite(templateStartOffset)) {
        return node.sourceSpan.start + templateStartOffset;
    }
    return node.sourceSpan.start;
}

function hasNonEmptyTrackBy(microsyntax: string): boolean {
    return /\btrackBy\s*:\s*[^;,\s]+/.test(microsyntax);
}

/**
 * Requires an explicit `trackBy` function on `*ngFor` directives.
 */
export const templateTrackByRequiredRule = createTemplateAttributeRule(
    'template-trackby-required-for-ngfor',
    (node: TemplateAttributeNode, context: RuleContext): RuleFailure | null => {
        if (node.name !== '*ngFor') return null;

        const value = node.value ?? '';
        if (hasNonEmptyTrackBy(value)) return null;

        const offset = getTemplateAbsoluteOffset(context, node);
        const { line, column } = context.locator.location(offset);

        return {
            filePath: context.filePath,
            ruleName: 'template-trackby-required-for-ngfor',
            message: 'Add a trackBy function to *ngFor to reduce unnecessary DOM updates for dynamic lists.',
            line,
            column,
            severity: 'error',
            fix: RECOMMENDATIONS['template-trackby-required-for-ngfor'],
        };
    },
    {
        requires: { htmlAst: true },
    }
);

/**
 * Checks for @for blocks without track expressions in the raw template source.
 * Returns an array of line numbers where violations are found.
 */
export function findForBlocksWithoutTrack(templateSource: string): { line: number; column: number }[] {
    const violations: { line: number; column: number }[] = [];
    // Match @for (...) but NOT followed by track expression
    const forBlockRegex = /@for\s*\(([^)]*)\)/g;
    let match: RegExpExecArray | null;

    while ((match = forBlockRegex.exec(templateSource)) !== null) {
        const forContent = match[1];
        // @for requires a `track` expression: @for (item of items; track item.id)
        if (!/\btrack\s+\S/.test(forContent)) {
            // Calculate line/column from offset
            const beforeMatch = templateSource.substring(0, match.index);
            const lines = beforeMatch.split('\n');
            violations.push({
                line: lines.length,
                column: (lines[lines.length - 1]?.length ?? 0) + 1,
            });
        }
    }

    return violations;
}

