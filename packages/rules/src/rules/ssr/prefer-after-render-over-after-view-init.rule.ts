import { AnyAngularClassNode } from "@ngcompass/ast";
import { RuleFailure } from "@ngcompass/common";
import { createAnyAngularClassRule } from '@ngcompass/engine';
import { RECOMMENDATIONS, CODE_EXAMPLES } from "../../recommendations";
import { AstNode, unwrapNode, getClassBody, getNodeStart, childNodes } from "../../rule-utils";
import { RuleContext } from "@ngcompass/common";

function shouldAnalyzeFile(filePath: string): boolean {
    return filePath.endsWith('.component.ts') || filePath.endsWith('.directive.ts');
}

/**
 * DOM-access patterns that indicate browser-only code inside ngAfterViewInit.
 */
const DOM_ACCESS_PATTERNS = [
    'nativeElement',
    'getBoundingClientRect',
    'querySelector',
    'querySelectorAll',
    'getElementById',
    'getElementsBy',
    'createElement',
    'scrollIntoView',
    'focus',
    'blur',
    'offsetWidth',
    'offsetHeight',
    'clientWidth',
    'clientHeight',
    'scrollTop',
    'scrollLeft',
    'innerHTML',
    'outerHTML',
    'textContent',
];

/**
 * Returns true if any node in the subtree accesses a DOM property.
 */
function bodyAccessesDom(body: AstNode): boolean {
    const stack: AstNode[] = [body];

    while (stack.length) {
        const node = stack.pop()!;
        const n = unwrapNode(node);
        if (!n) continue;

        // Check member expression property names
        if (
            (n.type === 'MemberExpression' || n.type === 'StaticMemberExpression' || n.type === 'OptionalMemberExpression') &&
            !n.computed
        ) {
            const propName = (n.property as AstNode)?.name as string ?? '';
            if (DOM_ACCESS_PATTERNS.some(p => propName === p || propName.startsWith(p))) {
                return true;
            }
        }

        // Check for direct `document.*` or `window.*` access
        if (n.type === 'Identifier') {
            const name = n.name as string ?? '';
            if (name === 'document' || name === 'window') return true;
        }

        for (const child of childNodes(n)) {
            stack.push(child);
        }
    }

    return false;
}

/**
 * Finds the class method node named `ngAfterViewInit` in the class body.
 */
function findAfterViewInitMethod(classBody: AstNode[]): AstNode | null {
    for (const member of classBody) {
        const m = unwrapNode(member);
        if (!m) continue;
        if (m.type !== 'MethodDefinition' && m.type !== 'PropertyDefinition') continue;
        const key = m.key;
        const name = key?.type === 'Identifier' ? (key.name as string) : '';
        if (name === 'ngAfterViewInit') return m;
    }
    return null;
}

/**
 * Gets the function body of a method definition.
 */
function getMethodBody(method: AstNode): AstNode | null {
    // MethodDefinition → value is FunctionExpression
    const fn = unwrapNode(method.value as AstNode | undefined);
    if (!fn) return null;
    const body = unwrapNode(fn.body as AstNode | undefined);
    return body ?? null;
}

/**
 * Flags `ngAfterViewInit` implementations that access the DOM directly and
 * suggests migrating to `afterNextRender()` for SSR safety.
 */
export const preferAfterRenderOverAfterViewInitRule = createAnyAngularClassRule(
    'prefer-after-render-over-after-view-init',
    (streamNode: AnyAngularClassNode, context: RuleContext): RuleFailure | null => {
        if (!shouldAnalyzeFile(context.filePath)) return null;

        const classNode = streamNode.node as unknown as AstNode;
        const classBody = getClassBody(classNode);
        if (classBody.length === 0) return null;

        const method = findAfterViewInitMethod(classBody);
        if (!method) return null;

        const body = getMethodBody(method);
        if (!body) return null;

        if (!bodyAccessesDom(body)) return null;

        const start = getNodeStart(method);
        const { line, column } = context.locator.location(start);

        return {
            filePath: context.filePath,
            ruleName: 'prefer-after-render-over-after-view-init',
            message: '`ngAfterViewInit` contains DOM access that will fail in SSR. Move browser-only DOM code into `afterNextRender()` to make it SSR-safe.',
            line,
            column,
            severity: 'warn',
            fix: RECOMMENDATIONS['prefer-after-render-over-after-view-init'],
            codeExample: CODE_EXAMPLES['prefer-after-render-over-after-view-init'],
        };
    }
);
