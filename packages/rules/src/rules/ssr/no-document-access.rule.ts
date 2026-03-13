import { RuleFailure } from "@ngcompass/common";
import { CallExpression } from "@ngcompass/ast";
import { createCallExpressionRule } from '@ngcompass/engine';
import { RECOMMENDATIONS, CODE_EXAMPLES } from "../../recommendations";
import { AstNode, unwrapNode, isMemberExpressionLike, getNodeStart } from "../../rule-utils";
import { RuleContext } from "@ngcompass/common";

/**
 * Global identifiers that are unavailable in SSR (Node.js) environments.
 */
const BROWSER_ONLY_GLOBALS = new Set([
    'document',
    'window',
    'localStorage',
    'sessionStorage',
    'navigator',
    'location',
]);

/**
 * Angular APIs that are the correct SSR-safe alternatives.
 * Access via these is not flagged.
 */
const SAFE_INJECTION_TOKENS = new Set([
    'DOCUMENT', // @angular/common
    'isPlatformBrowser',
    'isPlatformServer',
    'afterNextRender',
    'afterRender',
]);

/**
 * Returns the root identifier name of a member expression chain.
 * e.g.  `document.body.classList`  →  `"document"`
 *       `window.location.href`     →  `"window"`
 */
function getRootIdentifierName(node: AstNode): string | null {
    let current: AstNode | null = node;
    while (current) {
        if (current.type === 'Identifier') return (current.name as string) ?? null;
        if (isMemberExpressionLike(current)) {
            current = unwrapNode(current.object);
        } else {
            break;
        }
    }
    return null;
}

/**
 * Returns the browser-only global name referenced by the call expression, or null.
 */
function getBrowserGlobalFromCall(node: AstNode): string | null {
    const callee = unwrapNode(node.callee);
    if (!callee) return null;

    // Method call on a browser global: document.querySelector(...)
    if (isMemberExpressionLike(callee)) {
        const root = getRootIdentifierName(callee);
        if (root && BROWSER_ONLY_GLOBALS.has(root)) return root;
    }

    // Safe Angular APIs — skip
    if (callee.type === 'Identifier' && SAFE_INJECTION_TOKENS.has((callee.name as string) ?? '')) {
        return null;
    }

    return null;
}

/**
 * Flags direct access to browser-only globals (document, window, localStorage, etc.)
 * which throw in Angular Universal / @angular/ssr environments.
 * Safe alternatives: inject(DOCUMENT), afterNextRender(), isPlatformBrowser().
 */
export const noDocumentAccessRule = createCallExpressionRule(
    'no-document-access',
    (node: CallExpression, context: RuleContext): RuleFailure | null => {
        const n = node as any as AstNode;
        const globalName = getBrowserGlobalFromCall(n);
        if (!globalName) return null;

        const start = getNodeStart(n);
        const { line, column } = context.locator.location(start);

        return {
            filePath: context.filePath,
            ruleName: 'no-document-access',
            message: `Direct access to \`${globalName}\` breaks Angular SSR. Inject \`DOCUMENT\` from \`@angular/common\`, use \`afterNextRender()\`, or guard with \`isPlatformBrowser()\`.`,
            line,
            column,
            severity: 'error',
            fix: RECOMMENDATIONS['no-document-access'],
            codeExample: CODE_EXAMPLES['no-document-access'],
        };
    }
);
