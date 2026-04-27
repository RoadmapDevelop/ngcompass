import { AnyAngularClassNode } from '@ngcompass/ast';
import { RuleContext, RuleFailure } from '@ngcompass/common';
import { createAnyAngularClassRule } from '@ngcompass/engine';
import { RECOMMENDATIONS } from '../../recommendations';
import {
    AstNode,
    findEffectCalls,
    getClassBody,
    getMethodBody,
    getMethodName,
    getNodeStart,
    isConstructorMethod,
    isMethodDefinition,
    isMemberExpressionLike,
    getStaticPropertyName,
    unwrapNode,
} from '../../rule-utils';

const RULE_NAME = 'signal-effect-must-be-destroy-scoped';

function isEffectCall(node: AstNode): boolean {
    if (node.type !== 'CallExpression') return false;

    const callee = unwrapNode(node.callee);
    if (!callee) return false;

    if (callee.type === 'Identifier') return callee.name === 'effect';
    if (isMemberExpressionLike(callee)) return getStaticPropertyName(callee) === 'effect';

    return false;
}

function hasExplicitLifecycleOwnership(node: AstNode): boolean {
    const args = Array.isArray(node.arguments) ? node.arguments : [];
    const options = unwrapNode(args[1]);

    if (!options || options.type !== 'ObjectExpression') return false;

    const properties = Array.isArray(options.properties) ? options.properties : [];
    for (const propNode of properties) {
        const prop = unwrapNode(propNode);
        if (prop?.type === 'Property') {
            const keyNode = unwrapNode(prop.key);
            const key = keyNode?.type === 'Identifier' ? (keyNode.name as string) : (getStaticPropertyName(keyNode) || '');
            
            if (key === 'injector') return true;
            if (key === 'manualCleanup') {
                const value = unwrapNode(prop.value as AstNode);
                if (value?.type === 'Literal' && value.value === true) return true;
            }
        }
    }

    return false;
}

function createFailure(node: AstNode, methodName: string, context: RuleContext): RuleFailure {
    const start = getNodeStart(node);
    const { line, column } = context.locator.location(start);

    return {
        filePath: context.filePath,
        ruleName: RULE_NAME,
        message: `effect() called inside "${methodName}" without explicit lifecycle ownership. Create effects in an injection context (constructor or field initializer), or pass { injector } or { manualCleanup: true }.`,
        line,
        column,
        severity: 'error',
        fix: RECOMMENDATIONS[RULE_NAME],
    };
}

function collectMethodFailures(methodNode: AstNode, context: RuleContext): RuleFailure[] {
    const body = getMethodBody(methodNode);
    if (!body) return [];

    const methodName = getMethodName(methodNode);
    const failures: RuleFailure[] = [];

    for (const effectCall of findEffectCalls(body)) {
        if (isEffectCall(effectCall) && !hasExplicitLifecycleOwnership(effectCall)) {
            failures.push(createFailure(effectCall, methodName, context));
        }
    }

    return failures;
}

export const signalEffectDestroyScopedRule = createAnyAngularClassRule(
    RULE_NAME,
    (classNodeWrapper: AnyAngularClassNode, context: RuleContext): RuleFailure[] | null => {
        const classNode = classNodeWrapper.node as unknown as AstNode;
        const classBody = getClassBody(classNode);
        if (classBody.length === 0) return null;

        const failures: RuleFailure[] = [];
        for (const member of classBody) {
            if (member && isMethodDefinition(member) && !isConstructorMethod(member)) {
                failures.push(...collectMethodFailures(member, context));
            }
        }

        return failures.length > 0 ? failures : null;
    },
);