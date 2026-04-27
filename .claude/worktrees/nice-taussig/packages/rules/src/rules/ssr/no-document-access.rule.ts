import { AnyAngularClassNode } from "@ngcompass/ast";
import { RuleFailure, RuleContext } from "@ngcompass/common";
import { createAnyAngularClassRule } from '@ngcompass/engine';
import { RECOMMENDATIONS, CODE_EXAMPLES } from "../../recommendations";
import { AstNode, unwrapNode, isMemberExpressionLike, getNodeStart, getClassBody, childNodes, isCalleeNamed } from "../../rule-utils";

const BROWSER_GLOBALS = new Set(['document', 'window', 'localStorage', 'sessionStorage', 'navigator', 'location']);

function detectGuardType(node: AstNode, browserGuardVars: Set<string>): 'browser' | 'server' | null {
    const stack = [node];
    while (stack.length) {
        const n = unwrapNode(stack.pop()!);
        if (!n) continue;

        // Direct isPlatformBrowser() call
        if (n.type === 'CallExpression' && n.callee && isCalleeNamed(n.callee as AstNode, 'isPlatformBrowser')) return 'browser';

        // Direct isPlatformServer() call
        if (n.type === 'CallExpression' && n.callee && isCalleeNamed(n.callee as AstNode, 'isPlatformServer')) return 'server';

        // Negated !isPlatformServer() === browser guard
        if (n.type === 'UnaryExpression' && n.operator === '!' && n.argument) {
            const arg = unwrapNode(n.argument);
            if (arg?.type === 'CallExpression' && arg.callee && isCalleeNamed(arg.callee as AstNode, 'isPlatformServer')) return 'browser';
        }

        // Variable-based guard: if (isBrowser) where isBrowser = isPlatformBrowser(...)
        if (n.type === 'Identifier' && browserGuardVars.has(n.name as string)) return 'browser';

        for (const child of childNodes(n)) stack.push(child);
    }
    return null;
}

function collectBrowserGuardVars(classBody: AstNode[]): Set<string> {
    const vars = new Set<string>();
    const stack: AstNode[] = [...classBody];
    while (stack.length) {
        const n = unwrapNode(stack.pop()!);
        if (!n) continue;
        if (n.type === 'VariableDeclarator' && n.init) {
            const init = unwrapNode(n.init as AstNode);
            if (init?.type === 'CallExpression' && init.callee && isCalleeNamed(init.callee as AstNode, 'isPlatformBrowser')) {
                const id = (n as any).id ?? n.key;
                if (id?.type === 'Identifier' && id.name) vars.add(id.name as string);
            }
        }
        // Also detect property assignments: this.isBrowser = isPlatformBrowser(...)
        if (n.type === 'AssignmentExpression' && n.right) {
            const right = unwrapNode(n.right);
            if (right?.type === 'CallExpression' && right.callee && isCalleeNamed(right.callee as AstNode, 'isPlatformBrowser')) {
                const left = unwrapNode(n.left);
                if (left && isMemberExpressionLike(left) && unwrapNode(left.object)?.type === 'ThisExpression') {
                    const prop = (left.property as AstNode)?.name;
                    if (prop) vars.add(prop as string);
                }
            }
        }
        for (const child of childNodes(n)) stack.push(child);
    }
    return vars;
}

function getRoot(node: AstNode): string | null {
    let curr: any = node;
    while (curr && isMemberExpressionLike(curr)) curr = unwrapNode(curr.object);
    if (curr?.type === 'Identifier') return curr.name || null; // Assuming 'callee' was a typo for 'curr' and 'BYPASS_METHODS' is not intended here.
    return null;
}

export const noDocumentAccessRule = createAnyAngularClassRule(
    'no-document-access',
    (streamNode: AnyAngularClassNode, context: RuleContext): RuleFailure[] | null => {
        const classBody = getClassBody(streamNode.node as unknown as AstNode);
        if (classBody.length === 0) return null;

        const browserGuardVars = collectBrowserGuardVars(classBody);
        const failures: RuleFailure[] = [];
        const reported = new Set<number>();
        const stack: AstNode[] = [...classBody];

        while (stack.length) {
            const n = unwrapNode(stack.pop()!);
            if (!n) continue;

            if (n.type === 'IfStatement' && n.test) {
                const test = unwrapNode(n.test as AstNode);
                if (test) {
                    const guardType = detectGuardType(test, browserGuardVars);
                    if (guardType === 'browser') {
                        // Consequent is browser-only — skip it; process alternate (server fallback)
                        if (n.alternate) stack.push(n.alternate as AstNode);
                        continue;
                    }
                    if (guardType === 'server') {
                        // Consequent is server code — check it; alternate is browser-only — skip it
                        if (n.consequent) stack.push(n.consequent as AstNode);
                        continue;
                    }
                }
            }

            // afterNextRender / afterRender callbacks are browser-only — skip the callback body
            if (n.type === 'CallExpression' && n.callee) {
                const callee = unwrapNode(n.callee as AstNode);
                if (callee && (isCalleeNamed(callee, 'afterNextRender') || isCalleeNamed(callee, 'afterRender'))) {
                    // Skip callback (first arg), but process remaining args (options)
                    const args = (n.arguments ?? []) as AstNode[];
                    for (let i = 1; i < args.length; i++) stack.push(args[i]);
                    continue;
                }
            }

            if (isMemberExpressionLike(n)) {
                const rootName = getRoot(n);
                if (rootName && BROWSER_GLOBALS.has(rootName)) {
                    let root: any = n;
                    while (root && isMemberExpressionLike(root)) root = unwrapNode(root.object);
                    const start = getNodeStart(root as AstNode);
                    if (start !== undefined && !reported.has(start)) {
                        reported.add(start);
                        const { line, column } = context.locator.location(start);
                        failures.push({
                            filePath: context.filePath,
                            ruleName: 'no-document-access',
                            message: `Direct access to \`${rootName}\` breaks Angular SSR. Inject \`DOCUMENT\`, use \`afterNextRender()\`, or guard with \`isPlatformBrowser()\`.`,
                            line,
                            column,
                            severity: 'error',
                            fix: RECOMMENDATIONS['no-document-access'],
                            codeExample: CODE_EXAMPLES['no-document-access'],
                        });
                    }
                }
            }
            for (const child of childNodes(n)) stack.push(child);
        }
        return failures.length ? failures : null;
    }
);
