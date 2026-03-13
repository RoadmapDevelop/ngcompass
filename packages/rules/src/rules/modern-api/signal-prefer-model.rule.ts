import { AnyAngularClassNode } from "@ngcompass/ast";
import { RuleFailure } from "@ngcompass/common";
import { createAnyAngularClassRule } from '@ngcompass/engine';
import { RECOMMENDATIONS, CODE_EXAMPLES } from "../../recommendations";
import { AstNode, unwrapNode, getClassBody, getNodeStart } from "../../rule-utils";
import { RuleContext } from "@ngcompass/common";

function shouldAnalyzeFile(filePath: string): boolean {
    return filePath.endsWith('.component.ts') || filePath.endsWith('.directive.ts');
}

function getDecoratorName(dec: AstNode): string | null {
    const inner = unwrapNode(dec.expression ?? (dec as any).callee ?? dec);
    if (!inner) return null;
    if (inner.type === 'CallExpression') {
        const callee = unwrapNode(inner.callee);
        return callee?.type === 'Identifier' ? (callee.name as string) ?? null : null;
    }
    if (inner.type === 'Identifier') return inner.name as string ?? null;
    return null;
}

function getPropertyName(member: AstNode): string | null {
    const key = member.key as AstNode | undefined;
    if (!key) return null;
    if (key.type === 'Identifier') return key.name as string ?? null;
    if (key.type === 'Literal') return String(key.value);
    return null;
}

function isPropertyDecoratedWith(member: AstNode, decoratorName: string): boolean {
    if (member.type !== 'PropertyDefinition' && member.type !== 'AccessorProperty') return false;
    const decorators = member.decorators;
    if (!Array.isArray(decorators)) return false;
    return decorators.some((d: AstNode) => getDecoratorName(d) === decoratorName);
}

/**
 * Detects the `@Input() x + @Output() xChange` two-way binding pair pattern
 * and suggests migrating to the Angular 17.2+ `model()` signal.
 */
export const signalPreferModelRule = createAnyAngularClassRule(
    'signal-prefer-model',
    (streamNode: AnyAngularClassNode, context: RuleContext): RuleFailure[] | null => {
        if (!shouldAnalyzeFile(context.filePath)) return null;

        const classNode = streamNode.node as any as AstNode;
        const classBody = getClassBody(classNode);
        if (classBody.length === 0) return null;

        // Collect @Input() property names
        const inputNames = new Set<string>();
        const inputNodes = new Map<string, AstNode>();

        for (const member of classBody) {
            const m = unwrapNode(member);
            if (!m) continue;
            if (!isPropertyDecoratedWith(m, 'Input')) continue;
            const name = getPropertyName(m);
            if (name) {
                inputNames.add(name);
                inputNodes.set(name, m);
            }
        }

        if (inputNames.size === 0) return null;

        const failures: RuleFailure[] = [];

        // Look for @Output() properties whose name is `${inputName}Change`
        for (const member of classBody) {
            const m = unwrapNode(member);
            if (!m) continue;
            if (!isPropertyDecoratedWith(m, 'Output')) continue;

            const outputName = getPropertyName(m);
            if (!outputName || !outputName.endsWith('Change')) continue;

            const baseName = outputName.slice(0, -'Change'.length);
            if (!inputNames.has(baseName)) continue;

            // Found a paired @Input() x + @Output() xChange — flag the @Input()
            const inputNode = inputNodes.get(baseName)!;
            const start = getNodeStart(inputNode);
            const { line, column } = context.locator.location(start);

            failures.push({
                filePath: context.filePath,
                ruleName: 'signal-prefer-model',
                message: `The \`${baseName}\` / \`${outputName}\` pair implements two-way binding. Replace with the \`model()\` signal API (Angular 17.2+) for simpler, idiomatic two-way data flow.`,
                line,
                column,
                severity: 'warn',
                fix: RECOMMENDATIONS['signal-prefer-model'],
                codeExample: CODE_EXAMPLES['signal-prefer-model'],
            });
        }

        return failures.length > 0 ? failures : null;
    }
);
