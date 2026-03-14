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
 * Returns true when `node` is a class property decorated with `@Input()`.
 */
function isInputDecoratedProperty(node: AstNode): boolean {
    if (node.type !== 'PropertyDefinition' && node.type !== 'AccessorProperty') return false;

    const decorators = node.decorators;
    if (!Array.isArray(decorators) || decorators.length === 0) return false;

    return decorators.some((dec: AstNode) => {
        const inner = unwrapNode(dec.expression ?? (dec as any).callee ?? dec);
        if (!inner) return false;
        // @Input()  →  CallExpression whose callee is Identifier "Input"
        if (inner.type === 'CallExpression') {
            const callee = unwrapNode(inner.callee);
            return callee?.type === 'Identifier' && callee.name === 'Input';
        }
        // @Input (no call parens) — rare but valid
        if (inner.type === 'Identifier') return inner.name === 'Input';
        return false;
    });
}

/**
 * Flags `@Input()` class field decorators and recommends migrating to the
 * Angular 17.1+ `input()` / `input.required()` signal-based API.
 */
export const signalPreferInputSignalRule = createAnyAngularClassRule(
    'signal-prefer-input-signal',
    (streamNode: AnyAngularClassNode, context: RuleContext): RuleFailure[] | null => {
        if (!shouldAnalyzeFile(context.filePath)) return null;

        const classNode = streamNode.node as any as AstNode;
        const classBody = getClassBody(classNode);
        if (classBody.length === 0) return null;

        const failures: RuleFailure[] = [];

        for (const member of classBody) {
            const m = unwrapNode(member);
            if (!m) continue;
            if (!isInputDecoratedProperty(m)) continue;

            const propName = (m.key as AstNode)?.name ?? '(unknown)';
            const start = getNodeStart(m);
            const { line, column } = context.locator.location(start);

            // CTX-008: Escalate severity to 'error' for standalone components.
            // Standalone components (Angular 17+) are the modern composition model
            // where signal-based inputs are the unambiguous recommended API —
            // there is no legacy NgModule migration concern to be cautious about.
            const isStandalone = context.project?.standaloneComponents?.has(context.filePath) ?? false;
            const severity = isStandalone ? 'error' : 'warn';
            const standaloneNote = isStandalone
                ? ' This is a standalone component — signal inputs are the recommended API and @Input() has no migration path advantages here.'
                : '';

            failures.push({
                filePath: context.filePath,
                ruleName: 'signal-prefer-input-signal',
                message: `'${propName}' uses the legacy @Input() decorator. Migrate to the signal-based \`input()\` / \`input.required()\` API (Angular 17.1+).${standaloneNote}`,
                line,
                column,
                severity,
                fix: RECOMMENDATIONS['signal-prefer-input-signal'],
                codeExample: CODE_EXAMPLES['signal-prefer-input-signal'],
            });
        }

        return failures.length > 0 ? failures : null;
    },
    { requires: { projectContext: true } }
);
