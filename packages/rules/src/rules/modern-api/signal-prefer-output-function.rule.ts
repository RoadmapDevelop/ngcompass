import { AnyAngularClassNode } from '@ngcompass/ast';
import { RuleContext, RuleFailure } from '@ngcompass/common';
import { createAnyAngularClassRule } from '@ngcompass/engine';
import { CODE_EXAMPLES, RECOMMENDATIONS } from '../../recommendations';
import { AstNode, getClassBody, getNodeStart, getParamTypeName, getTsSymbolAtNode, unwrapNode } from '../../rule-utils';

const RULE_NAME = 'signal-prefer-output-function';

function isOutputDecorator(member: AstNode): boolean {
    return Array.isArray(member.decorators) && member.decorators.some(d => {
        const expr = unwrapNode(d.expression ?? d);
        if (!expr) return false;
        if (expr.type === 'Identifier') return expr.name === 'Output';
        if (expr.type === 'CallExpression') {
            const callee = unwrapNode(expr.callee);
            return callee?.type === 'Identifier' && callee.name === 'Output';
        }
        return false;
    });
}

function isEventEmitter(member: AstNode, context: RuleContext): boolean {
    const val = unwrapNode(member.value as AstNode);
    if (val?.type === 'NewExpression') {
        const callee = unwrapNode(val.callee);
        if (callee?.type === 'Identifier' && callee.name === 'EventEmitter') return true;
    }

    const typeAnn = unwrapNode(member.typeAnnotation as AstNode);
    if (typeAnn && getParamTypeName(typeAnn).includes('EventEmitter')) return true;

    if (context.typeChecker) {
        const sym = getTsSymbolAtNode(member, context);
        if (sym && (typeof sym.getName === 'function' ? sym.getName() : '').includes('EventEmitter')) return true;
    }
    return false;
}

export const signalPreferOutputFunctionRule = createAnyAngularClassRule(
    RULE_NAME,
    (classNodeWrapper: AnyAngularClassNode, context: RuleContext): RuleFailure[] | null => {
        if (!context.filePath.endsWith('.component.ts') && !context.filePath.endsWith('.directive.ts')) return null;

        const classBody = getClassBody(classNodeWrapper.node as AstNode);
        const failures: RuleFailure[] = [];

        for (const member of classBody) {
            const m = unwrapNode(member);
            if (!m || (m.type !== 'PropertyDefinition' && m.type !== 'AccessorProperty')) continue;

            if (isOutputDecorator(m) && isEventEmitter(m, context)) {
                const start = getNodeStart(m);
                const { line, column } = context.locator.location(start);
                const key = unwrapNode(m.key);
                const name = (key?.type === 'Identifier' ? key.name : (key?.type === 'Literal' ? String(key.value) : '')) || '(unknown)';

                failures.push({
                    filePath: context.filePath,
                    ruleName: RULE_NAME,
                    message: `'${name}' uses the legacy @Output() EventEmitter pattern. Prefer the \`output()\` function API (Angular 17.3+) for a more modern, idiomatic output declaration.`,
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