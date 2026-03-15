import { RuleFailure } from "@ngcompass/common";
import { CallExpression } from "@ngcompass/ast";
import { createCallExpressionRule } from '@ngcompass/engine';
import { RECOMMENDATIONS } from "../../recommendations";
import { AstNode, unwrapNode, isMemberExpressionLike, getStaticPropertyName, getNodeStart } from "../../rule-utils";
import { RuleContext } from "@ngcompass/common";

/**
 * DomSanitizer bypass methods that bypass Angular's built-in XSS protection.
 * Each maps to a description of what it bypasses for the violation message.
 */
const BYPASS_METHODS = new Map<string, string>([
    ['bypassSecurityTrustHtml', 'HTML'],
    ['bypassSecurityTrustScript', 'Script'],
    ['bypassSecurityTrustStyle', 'Style'],
    ['bypassSecurityTrustUrl', 'URL'],
    ['bypassSecurityTrustResourceUrl', 'Resource URL'],
]);

function getBypassMethodName(node: AstNode): string | null {
    const callee = unwrapNode(node.callee);
    if (!callee) return null;

    // Direct call: bypassSecurityTrustHtml(...)
    if (callee.type === 'Identifier') {
        return BYPASS_METHODS.has(callee.name as string) ? (callee.name as string) : null;
    }

    // Member call: this.sanitizer.bypassSecurityTrustHtml(...)
    if (isMemberExpressionLike(callee)) {
        const name = getStaticPropertyName(callee);
        return BYPASS_METHODS.has(name) ? name : null;
    }

    return null;
}

/**
 * Flags calls to DomSanitizer bypass methods (bypassSecurityTrustHtml, etc.).
 * These methods disable Angular's built-in XSS sanitization and must only be
 * used when the content is provably safe and from a trusted source.
 */
export const noBypassSanitizationRule = createCallExpressionRule(
    'no-bypass-sanitization',
    (node: CallExpression, context: RuleContext): RuleFailure | null => {
        const methodName = getBypassMethodName(node as unknown as AstNode);
        if (!methodName) return null;

        const context_ = BYPASS_METHODS.get(methodName)!;
        const start = getNodeStart(node as unknown as AstNode);
        const { line, column } = context.locator.location(start);

        return {
            filePath: context.filePath,
            ruleName: 'no-bypass-sanitization',
            message: `\`${methodName}\` bypasses Angular's ${context_} sanitization. Only use this when content is provably safe and sourced from trusted input — never with user-supplied data.`,
            line,
            column,
            severity: 'error',
            fix: RECOMMENDATIONS['no-bypass-sanitization'],
        };
    }
);
