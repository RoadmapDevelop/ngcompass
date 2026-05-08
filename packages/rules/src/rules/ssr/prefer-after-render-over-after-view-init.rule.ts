import { AnyAngularClassNode } from "@ngcompass/ast";
import { RuleFailure, RuleContext } from "@ngcompass/common";
import { createAnyAngularClassRule } from '@ngcompass/engine';
import { RECOMMENDATIONS, CODE_EXAMPLES } from "../../recommendations";
import { AstNode, unwrapNode, getClassBody, getNodeStart, childNodes, getMethodBody } from "../../rule-utils";

const DOM_PATTERNS = new Set([
    'nativeElement', 'getBoundingClientRect', 'querySelector', 'querySelectorAll',
    'getElementById', 'createElement', 'scrollIntoView', 'focus', 'blur',
    'offsetWidth', 'offsetHeight', 'clientWidth', 'clientHeight',
    'scrollTop', 'scrollLeft', 'innerHTML', 'outerHTML', 'textContent',
    // DOM traversal
    'parentElement', 'parentNode', 'firstChild', 'lastChild',
    'nextSibling', 'previousSibling', 'children', 'ownerDocument',
    // DOM manipulation
    'insertBefore', 'appendChild', 'removeChild', 'replaceChild', 'cloneNode',
    'setAttribute', 'getAttribute', 'removeAttribute', 'hasAttribute',
    'classList', 'dispatchEvent',
    // DOM query
    'contains', 'matches', 'closest', 'getClientRects',
    // Events
    'addEventListener', 'removeEventListener',
    // Browser APIs
    'requestAnimationFrame', 'cancelAnimationFrame',
]);
const DOM_PATTERN_PREFIXES = ['getElementsBy', 'offset', 'client', 'scroll'];

function bodyAccessesDom(root: AstNode): boolean {
    const stack = [root];
    while (stack.length) {
        const n = unwrapNode(stack.pop());
        if (!n) continue;
        if ((n.type === 'MemberExpression' || n.type === 'StaticMemberExpression' || n.type === 'OptionalMemberExpression') && !n.computed) {
            const name = (n.property?.name) ?? '';
            if (DOM_PATTERNS.has(name)) return true;
            for (const p of DOM_PATTERN_PREFIXES) { if (name.startsWith(p)) return true; }
        }
        if (n.type === 'Identifier' && (n.name === 'document' || n.name === 'window')) return true;
        for (const child of childNodes(n)) stack.push(child);
    }
    return false;
}

export const preferAfterRenderOverAfterViewInitRule = createAnyAngularClassRule(
    'prefer-after-render-over-after-view-init',
    (streamNode: AnyAngularClassNode, context: RuleContext): RuleFailure[] | null => {
        if (streamNode.decoratorName !== 'Component' && streamNode.decoratorName !== 'Directive') return null;

        const classBody = getClassBody(streamNode.node as unknown as AstNode);
        const LIFECYCLE_HOOKS = ['ngAfterViewInit', 'ngAfterContentInit'];
        const failures: RuleFailure[] = [];

        for (const hookName of LIFECYCLE_HOOKS) {
            const method = classBody.find(m => m.key?.name === hookName);
            const body = method ? getMethodBody(method) : null;
            if (!body || !method || !bodyAccessesDom(body)) continue;

            const { line, column } = context.locator.location(getNodeStart(method));
            failures.push({
                filePath: context.filePath,
                ruleName: 'prefer-after-render-over-after-view-init',
                message: `\`${hookName}\` contains DOM access that can run before browser-only APIs are safe.`,
                line,
                column,
                severity: 'warn',
                fix: RECOMMENDATIONS['prefer-after-render-over-after-view-init'],
                codeExample: CODE_EXAMPLES['prefer-after-render-over-after-view-init'],
            });
        }
        return failures.length ? failures : null;
    }
);
