import { TemplateAttributeNode } from "@ngcompass/ast";
import { RuleFailure, RuleContext } from "@ngcompass/common";
import { createTemplateAttributeRule } from '@ngcompass/engine';
import { RECOMMENDATIONS } from "../../recommendations";
import { getTemplateAbsoluteOffset } from "../../rule-utils";

const LEGACY_DIRECTIVES = new Map<string, string>([
    ['*ngIf', '@if'],
    ['*ngFor', '@for'],
    ['*ngSwitch', '@switch'],
    ['[ngSwitch]', '@switch'],
    ['*ngSwitchCase', '@case'],
    ['*ngSwitchDefault', '@default'],
]);

const RULE_NAME = 'template-prefer-control-flow';

function getModernEquivalent(directiveName: string): string | null {
    return LEGACY_DIRECTIVES.get(directiveName) ?? null;
}

export const templatePreferControlFlowRule = createTemplateAttributeRule(
    RULE_NAME,
    (node: TemplateAttributeNode, context: RuleContext): RuleFailure | null => {
        const modern = getModernEquivalent(node.name);
        if (!modern) {
            return null;
        }

        const offset = getTemplateAbsoluteOffset(context, node.sourceSpan.start);
        const { line, column } = context.locator.location(offset);

        return {
            filePath: context.filePath,
            ruleName: RULE_NAME,
            message: `Replace \`${node.name}\` with the Angular 17+ built-in \`${modern}\` control flow block for better performance and type-narrowing.`,
            line,
            column,
            severity: 'error',
            fix: RECOMMENDATIONS[RULE_NAME],
        };
    },
    {
        requires: { htmlAst: true },
    }
);
