import { RuleFailure, RuleContext } from "@ngcompass/common";
import { CallExpression } from "@ngcompass/ast";
import { createCallExpressionRule } from '@ngcompass/engine';
import { RECOMMENDATIONS } from "../../recommendations";
import { AstNode, unwrapNode, isMemberExpressionLike, getStaticPropertyName, getNodeStart } from "../../rule-utils";

const BYPASS_METHODS = new Map<string, string>([
    ['bypassSecurityTrustHtml', 'HTML'],
    ['bypassSecurityTrustScript', 'Script'],
    ['bypassSecurityTrustStyle', 'Style'],
    ['bypassSecurityTrustUrl', 'URL'],
    ['bypassSecurityTrustResourceUrl', 'Resource URL'],
]);

function getMethodName(node: AstNode): string | null {
    const callee = unwrapNode(node.callee);
    if (!callee) return null;
    if (callee.type === 'Identifier' && callee.name) return BYPASS_METHODS.has(callee.name) ? callee.name : null;
    if (isMemberExpressionLike(callee)) {
        const name = getStaticPropertyName(callee);
        return name && BYPASS_METHODS.has(name) ? name : null;
    }
    return null;
}

export const noBypassSanitizationRule = createCallExpressionRule(
    'no-bypass-sanitization',
    (node: CallExpression, context: RuleContext): RuleFailure | null => {
        const name = getMethodName(node as unknown as AstNode);
        if (!name) return null;

        const { line, column } = context.locator.location(getNodeStart(node as unknown as AstNode));
        return {
            filePath: context.filePath,
            ruleName: 'no-bypass-sanitization',
            message: `\`${name}\` bypasses Angular's ${BYPASS_METHODS.get(name)} sanitization, which can expose unsafe content.`,
            line,
            column,
            severity: 'error',
            fix: RECOMMENDATIONS['no-bypass-sanitization'],
        };
    }
);
