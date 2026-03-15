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

const LEGACY_STRUCTURAL_DIRECTIVES = new Map<string, string>([
    ['*ngIf', '@if'],
    ['*ngFor', '@for'],
    ['*ngSwitch', '@switch'],
    ['[ngSwitch]', '@switch'],
    ['*ngSwitchCase', '@case'],
    ['*ngSwitchDefault', '@default'],
]);

/**
 * Flags legacy structural directives (*ngIf, *ngFor, *ngSwitch) and suggests
 * migrating to Angular 17+ built-in control flow syntax (@if, @for, @switch).
 */
export const templatePreferControlFlowRule = createTemplateAttributeRule(
    'template-prefer-control-flow',
    (node: TemplateAttributeNode, context: RuleContext): RuleFailure | null => {
        const modern = LEGACY_STRUCTURAL_DIRECTIVES.get(node.name);
        if (!modern) return null;

        const offset = getTemplateAbsoluteOffset(context, node);
        const { line, column } = context.locator.location(offset);

        return {
            filePath: context.filePath,
            ruleName: 'template-prefer-control-flow',
            message: `Replace \`${node.name}\` with the Angular 17+ built-in \`${modern}\` control flow block for better performance and type-narrowing.`,
            line,
            column,
            severity: 'error',
            fix: RECOMMENDATIONS['template-prefer-control-flow'],
        };
    },
    {
        requires: { htmlAst: true },
    }
);
