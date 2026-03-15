import { AnyAngularClassNode } from "@ngcompass/ast";
import { RuleFailure } from "@ngcompass/common";
import { createAnyAngularClassRule } from '@ngcompass/engine';
import { RECOMMENDATIONS, CODE_EXAMPLES } from "../../recommendations";
import { AstNode, unwrapNode, getClassBody, getNodeStart } from "../../rule-utils";
import { RuleContext } from "@ngcompass/common";

function shouldAnalyzeFile(filePath: string): boolean {
    return filePath.endsWith('.component.ts') || filePath.endsWith('.directive.ts');
}

/**
 * Returns true when `node` is a class property decorated with `@Output()`.
 */
function isOutputDecoratedProperty(node: AstNode): boolean {
    if (node.type !== 'PropertyDefinition' && node.type !== 'AccessorProperty') return false;

    const decorators = node.decorators;
    if (!Array.isArray(decorators) || decorators.length === 0) return false;

    return decorators.some((dec: AstNode) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const inner = unwrapNode(dec.expression ?? (dec as any).callee ?? dec);
        if (!inner) return false;
        if (inner.type === 'CallExpression') {
            const callee = unwrapNode(inner.callee);
            return callee?.type === 'Identifier' && callee.name === 'Output';
        }
        if (inner.type === 'Identifier') return inner.name === 'Output';
        return false;
    });
}

/**
 * Flags `@Output() EventEmitter` properties and recommends migrating to the
 * Angular 17.3+ `output()` function API.
 */
export const signalPreferOutputFunctionRule = createAnyAngularClassRule(
    'signal-prefer-output-function',
    (streamNode: AnyAngularClassNode, context: RuleContext): RuleFailure[] | null => {
        if (!shouldAnalyzeFile(context.filePath)) return null;

        const classNode = streamNode.node as unknown as AstNode;
        const classBody = getClassBody(classNode);
        if (classBody.length === 0) return null;

        const failures: RuleFailure[] = [];

        for (const member of classBody) {
            const m = unwrapNode(member);
            if (!m) continue;
            if (!isOutputDecoratedProperty(m)) continue;

            const propName = (m.key as AstNode)?.name ?? '(unknown)';
            const start = getNodeStart(m);
            const { line, column } = context.locator.location(start);

            failures.push({
                filePath: context.filePath,
                ruleName: 'signal-prefer-output-function',
                message: `'${propName}' uses the legacy @Output() EventEmitter pattern. Migrate to the \`output()\` function API (Angular 17.3+).`,
                line,
                column,
                severity: 'warn',
                fix: RECOMMENDATIONS['signal-prefer-output-function'],
                codeExample: CODE_EXAMPLES['signal-prefer-output-function'],
            });
        }

        return failures.length > 0 ? failures : null;
    }
);
