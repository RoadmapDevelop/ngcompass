import { AnyAngularClassNode } from '@ngcompass/ast';
import { RuleContext, RuleFailure } from '@ngcompass/common';
import { createAnyAngularClassRule } from '@ngcompass/engine';
import { CODE_EXAMPLES, RECOMMENDATIONS } from '../../recommendations';
import { AstNode, getClassBody, getNodeStart, isMemberExpressionLike, unwrapNode } from '../../rule-utils';

const RULE_NAME = 'signal-prefer-model';

function getDecoratorName(member: AstNode, name: string): boolean {
    return Array.isArray(member.decorators) && member.decorators.some(d => {
        const expr = unwrapNode(d.expression ?? d);
        if (!expr) return false;
        if (expr.type === 'Identifier') return expr.name === name;
        if (expr.type === 'CallExpression') {
            const callee = unwrapNode(expr.callee);
            return callee?.type === 'Identifier' && callee.name === name;
        }
        return false;
    });
}

function hasSignal(member: AstNode, name: string): boolean {
    const val = unwrapNode(member.value as AstNode);
    if (!val || val.type !== 'CallExpression') return false;
    const callee = unwrapNode(val.callee);
    if (!callee) return false;
    if (callee.type === 'Identifier') return callee.name === name;
    if (isMemberExpressionLike(callee)) {
        const obj = unwrapNode(callee.object);
        return obj?.type === 'Identifier' && obj.name === name;
    }
    return false;
}

function getMemberName(member: AstNode): string | null {
    const key = unwrapNode(member.key as AstNode | undefined);
    if (!key) return null;
    return key.type === 'Identifier' ? (key.name ?? null) : (key.type === 'Literal' ? String(key.value) : null);
}

export const signalPreferModelRule = createAnyAngularClassRule(
    RULE_NAME,
    (classNodeWrapper: AnyAngularClassNode, context: RuleContext): RuleFailure[] | null => {
        if (!context.filePath.endsWith('.component.ts') && !context.filePath.endsWith('.directive.ts')) return null;

        const classBody = getClassBody(classNodeWrapper.node as AstNode);
        const inputs = new Map<string, AstNode>();
        const outputs = new Map<string, AstNode>();

        for (const member of classBody) {
            const m = unwrapNode(member);
            if (!m || (m.type !== 'PropertyDefinition' && m.type !== 'AccessorProperty')) continue;

            const name = getMemberName(m);
            if (!name) continue;

            if (getDecoratorName(m, 'Input') || hasSignal(m, 'input')) inputs.set(name, m);
            if (getDecoratorName(m, 'Output') || hasSignal(m, 'output')) outputs.set(name, m);
        }

        const failures: RuleFailure[] = [];
        for (const [name, _] of outputs) {
            if (!name.endsWith('Change')) continue;
            const base = name.slice(0, -6);
            const inputNode = inputs.get(base);
            if (inputNode) {
                const start = getNodeStart(inputNode);
                const { line, column } = context.locator.location(start);
                failures.push({
                    filePath: context.filePath,
                    ruleName: RULE_NAME,
                    message: `The \`${base}\` / \`${name}\` pair implements two-way binding. Prefer the \`model()\` signal API (Angular 17.2+) for simpler, idiomatic two-way data flow.`,
                    line,
                    column,
                    severity: 'warn',
                    fix: RECOMMENDATIONS[RULE_NAME],
                    codeExample: CODE_EXAMPLES[RULE_NAME],
                });
            }
        }
        return failures.length > 0 ? failures : null;
    }
);