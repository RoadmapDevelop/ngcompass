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
const EFFECT_NAME = 'effect';
const INJECTOR_OPTION = 'injector';
const MANUAL_CLEANUP_OPTION = 'manualCleanup';

/**
 * Returns true when the node is an `effect(...)` call.
 */
function isEffectCall(node: AstNode): boolean {
    if (node.type !== 'CallExpression') {
        return false;
    }

    const callee = unwrapNode(node.callee);
    if (!callee) {
        return false;
    }

    if (callee.type === 'Identifier') {
        return callee.name === EFFECT_NAME;
    }

    if (isMemberExpressionLike(callee)) {
        return getStaticPropertyName(callee) === EFFECT_NAME;
    }

    return false;
}

/**
 * Returns the second argument passed to `effect(...)`, if present.
 */
function getEffectOptionsArgument(node: AstNode): AstNode | null {
    if (!isEffectCall(node)) {
        return null;
    }

    const args = Array.isArray(node.arguments) ? node.arguments : [];
    const options = unwrapNode(args[1] as AstNode);

    return options ?? null;
}

/**
 * Returns the static property name for an object property key.
 */
function getObjectPropertyName(node: AstNode): string {
    const key = unwrapNode((node as AstNode & { key?: AstNode }).key);
    if (!key) {
        return '';
    }

    if (key.type === 'Identifier') {
        return key.name as string;
    }

    return getStaticPropertyName(key) || '';
}

/**
 * Returns the property value for an object property node.
 */
function getObjectPropertyValue(node: AstNode): AstNode | null {
    const value = unwrapNode((node as AstNode & { value?: AstNode }).value);
    return value ?? null;
}

/**
 * Returns true when the node is an object property with the provided static name.
 */
function isNamedObjectProperty(node: AstNode, name: string): boolean {
    return node.type === 'Property' && getObjectPropertyName(node) === name;
}

/**
 * Returns true when the node is the boolean literal `true`.
 */
function isTrueLiteral(node: AstNode | null): boolean {
    if (!node) {
        return false;
    }

    return node.type === 'Literal' && node.value === true;
}

/**
 * Returns true when the options object contains an `injector` property.
 */
function hasInjectorOption(node: AstNode): boolean {
    if (node.type !== 'ObjectExpression') {
        return false;
    }

    const properties = Array.isArray(node.properties) ? node.properties : [];

    for (const propertyNode of properties) {
        const property = unwrapNode(propertyNode as AstNode);
        if (!property || !isNamedObjectProperty(property, INJECTOR_OPTION)) {
            continue;
        }

        return true;
    }

    return false;
}

/**
 * Returns true when the options object contains `manualCleanup: true`.
 */
function hasManualCleanupOption(node: AstNode): boolean {
    if (node.type !== 'ObjectExpression') {
        return false;
    }

    const properties = Array.isArray(node.properties) ? node.properties : [];

    for (const propertyNode of properties) {
        const property = unwrapNode(propertyNode as AstNode);
        if (!property || !isNamedObjectProperty(property, MANUAL_CLEANUP_OPTION)) {
            continue;
        }

        return isTrueLiteral(getObjectPropertyValue(property));
    }

    return false;
}

/**
 * Returns true when the `effect(...)` call has explicit lifecycle ownership.
 */
function hasExplicitLifecycleOwnership(node: AstNode): boolean {
    const options = getEffectOptionsArgument(node);
    if (!options || options.type !== 'ObjectExpression') {
        return false;
    }

    return hasInjectorOption(options) || hasManualCleanupOption(options);
}

/**
 * Returns true when the `effect(...)` call should be reported.
 */
function shouldReportEffectCall(node: AstNode): boolean {
    if (!isEffectCall(node)) {
        return false;
    }

    return !hasExplicitLifecycleOwnership(node);
}

/**
 * Creates a rule failure for an unscoped `effect(...)` call inside a class method.
 */
function createFailure(
    node: AstNode,
    methodName: string,
    context: RuleContext,
): RuleFailure {
    const start = getNodeStart(node);
    const { line, column } = context.locator.location(start);

    return {
        filePath: context.filePath,
        ruleName: RULE_NAME,
        message:
            `effect() called inside "${methodName}" without explicit lifecycle ownership. ` +
            'Create effects in an injection context (constructor or field initializer), or pass ' +
            '{ injector } or { manualCleanup: true }.',
        line,
        column,
        severity: 'error',
        fix: RECOMMENDATIONS[RULE_NAME],
    };
}

/**
 * Returns all unscoped `effect(...)` failures found in the provided method.
 */
function collectMethodFailures(
    methodNode: AstNode,
    context: RuleContext,
): RuleFailure[] {
    const body = getMethodBody(methodNode);
    if (!body) {
        return [];
    }

    const methodName = getMethodName(methodNode);
    const effectCalls = findEffectCalls(body);
    const failures: RuleFailure[] = [];

    for (const effectCall of effectCalls) {
        if (!shouldReportEffectCall(effectCall)) {
            continue;
        }

        failures.push(createFailure(effectCall, methodName, context));
    }

    return failures;
}

/**
 * Returns true when the class member should be analyzed as an instance method.
 */
function isAnalyzableMethod(member: AstNode): boolean {
    return isMethodDefinition(member) && !isConstructorMethod(member);
}

/**
 * Flags `effect(...)` calls inside class methods unless lifecycle ownership is
 * explicit via `{ injector }` or `{ manualCleanup: true }`.
 */
export const signalEffectDestroyScopedRule = createAnyAngularClassRule(
    RULE_NAME,
    (classNodeWrapper: AnyAngularClassNode, context: RuleContext): RuleFailure[] | null => {
        const classNode = classNodeWrapper.node as unknown as AstNode;
        const classBody = getClassBody(classNode);

        if (classBody.length === 0) {
            return null;
        }

        const failures: RuleFailure[] = [];

        for (const member of classBody) {
            if (!member || !isAnalyzableMethod(member)) {
                continue;
            }

            failures.push(...collectMethodFailures(member, context));
        }

        return failures.length > 0 ? failures : null;
    },
);