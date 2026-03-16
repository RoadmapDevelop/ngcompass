import {
    AnyAngularClassNode,
    ChangeDetectionStrategy,
    analyzeComponent,
} from '@ngcompass/ast';
import { RuleContext, RuleFailure } from '@ngcompass/common';
import { createAnyAngularClassRule } from '@ngcompass/engine';

import {
    AstNode,
    childNodes,
    getClassBody,
    getNodeStart,
    getParamIdentifierName,
    getParamTypeName,
    getParamsArray,
    getStaticPropertyName,
    getConstructorMember,
    isMemberExpressionLike,
    unwrapNode,
} from '../../rule-utils';
import { CODE_EXAMPLES, RECOMMENDATIONS } from '../../recommendations';

const RULE_NAME = 'component-no-manual-detect-changes';
const DISCOURAGED_CDR_METHODS = new Set(['detectChanges', 'markForCheck']);
const HEURISTIC_CDR_NAMES = new Set([
    'cdr',
    'cdref',
    'changedetectorref',
    '_cdr',
    '_cdref',
    'changedetector',
    '_changedetector',
    'changedetectionref',
    'cd',
    '_cd',
]);

/**
 * Returns true when the node is `inject(ChangeDetectorRef)`.
 */
function isInjectChangeDetectorRefCall(node: AstNode): boolean {
    if (node.type !== 'CallExpression') {
        return false;
    }

    const callee = unwrapNode(node.callee);
    if (callee?.type !== 'Identifier' || callee.name !== 'inject') {
        return false;
    }

    const [firstArg] = node.arguments ?? [];
    const token = unwrapNode(firstArg as AstNode);

    return token?.type === 'Identifier' && token.name === 'ChangeDetectorRef';
}

/**
 * Returns true when the provided parameter is typed as `ChangeDetectorRef`.
 */
function isChangeDetectorRefParam(param: AstNode): boolean {
    return getParamTypeName(param) === 'ChangeDetectorRef';
}

/**
 * Collects constructor-injected and `inject()`-based `ChangeDetectorRef` aliases.
 */
function collectExplicitCdrAliases(classNode: AstNode): Set<string> {
    const aliases = new Set<string>();
    const classBody = getClassBody(classNode);

    collectConstructorCdrAliases(classBody, aliases);
    collectInjectedFieldCdrAliases(classBody, aliases);

    return aliases;
}

/**
 * Collects constructor parameter aliases typed as `ChangeDetectorRef`.
 */
function collectConstructorCdrAliases(classBody: AstNode[], aliases: Set<string>): void {
    const ctor = getConstructorMember(classBody);
    if (!ctor) {
        return;
    }

    const ctorValue = (ctor.value ?? ctor) as AstNode;
    const params = getParamsArray(ctorValue);

    for (const param of params) {
        if (!isChangeDetectorRefParam(param)) {
            continue;
        }

        const alias = getParamIdentifierName(param);
        if (alias) {
            aliases.add(alias);
        }
    }
}

/**
 * Collects class field aliases initialized with `inject(ChangeDetectorRef)`.
 */
function collectInjectedFieldCdrAliases(classBody: AstNode[], aliases: Set<string>): void {
    for (const member of classBody) {
        if (member.type !== 'PropertyDefinition' || !member.value) {
            continue;
        }

        const value = unwrapNode(member.value as AstNode);
        if (!value || !isInjectChangeDetectorRefCall(value)) {
            continue;
        }

        const key = member.key;
        if (key?.type === 'Identifier') {
            aliases.add(key.name as string);
        }
    }
}

/**
 * Returns true when the component uses `ChangeDetectionStrategy.OnPush`.
 */
function isOnPushComponent(classNode: AstNode): boolean {
    const metadata = analyzeComponent(classNode as never);

    return (
        metadata?.type === 'Component' &&
        metadata.changeDetection?.kind === 'literal' &&
        metadata.changeDetection.value === ChangeDetectionStrategy.OnPush
    );
}

/**
 * Returns true when the class node represents an Angular component.
 */
function isAngularComponent(classNode: AstNode): boolean {
    const metadata = analyzeComponent(classNode as never);
    return metadata?.type === 'Component';
}

/**
 * Returns true when the alias is a tracked or heuristically valid CDR reference.
 */
function createCdrAliasMatcher(explicitAliases: Set<string>): (name: string) => boolean {
    const hasExplicitAliases = explicitAliases.size > 0;

    return (name: string): boolean => {
        if (explicitAliases.has(name)) {
            return true;
        }

        if (hasExplicitAliases) {
            return false;
        }

        return HEURISTIC_CDR_NAMES.has(name.toLowerCase());
    };
}

/**
 * Returns the discouraged method name when the node is a discouraged CDR call.
 */
function getDiscouragedMethodName(node: AstNode): string | null {
    if (node.type !== 'CallExpression') {
        return null;
    }

    const callee = unwrapNode(node.callee);
    if (!isMemberExpressionLike(callee)) {
        return null;
    }

    const methodName = getStaticPropertyName(callee);
    if (!methodName || !DISCOURAGED_CDR_METHODS.has(methodName)) {
        return null;
    }

    return methodName;
}

/**
 * Returns true when the member-expression receiver resolves to a tracked CDR alias.
 */
function isTrackedCdrReceiver(callNode: AstNode, isCdrAlias: (name: string) => boolean): boolean {
    if (callNode.type !== 'CallExpression') {
        return false;
    }

    const callee = unwrapNode(callNode.callee);
    if (!callee || !isMemberExpressionLike(callee)) {
        return false;
    }

    const target = unwrapNode(callee.object);
    if (!target) {
        return false;
    }

    if (target.type === 'Identifier') {
        return isCdrAlias(target.name as string);
    }

    if (!target || !isMemberExpressionLike(target)) {
        return false;
    }

    const receiver = unwrapNode(target.object);
    const propertyName = getStaticPropertyName(target);

    const isThis = receiver?.type === 'ThisExpression' || (receiver?.type === 'Identifier' && receiver.name === 'this');
    return isThis && !!propertyName && isCdrAlias(propertyName);
}

/**
 * Creates a rule failure for a discouraged manual change-detection call.
 */
function createFailure(
    node: AstNode,
    context: RuleContext,
    methodName: string,
    isOnPush: boolean,
): RuleFailure {
    const start = getNodeStart(node);
    const { line, column } = context.locator.location(start);

    return {
        filePath: context.filePath,
        ruleName: RULE_NAME,
        message: buildFailureMessage(methodName, isOnPush),
        line,
        column,
        severity: isOnPush ? 'warn' : 'error',
        fix: RECOMMENDATIONS[RULE_NAME],
        codeExample: CODE_EXAMPLES[RULE_NAME],
    };
}

/**
 * Builds the rule message for a discouraged manual change-detection call.
 */
function buildFailureMessage(methodName: string, isOnPush: boolean): string {
    if (isOnPush) {
        return 'Prefer Signals or async pipe over detectChanges() even with OnPush. Manual CD triggers couple your component to imperative rendering.';
    }

    return `Avoid manual change detection (${methodName}). Prefer Signals/async pipe for reactivity.`;
}

/**
 * Returns true when the call should be skipped for the given component strategy.
 */
function shouldSkipCall(methodName: string, isOnPush: boolean): boolean {
    return isOnPush && methodName === 'markForCheck';
}

/**
 * Traverses the class body and returns all discouraged manual CDR failures.
 */
function findManualChangeDetectionFailures(
    classNode: AstNode,
    context: RuleContext,
    isOnPush: boolean,
    isCdrAlias: (name: string) => boolean,
): RuleFailure[] {
    const failures: RuleFailure[] = [];
    const stack: AstNode[] = [...getClassBody(classNode)];

    while (stack.length > 0) {
        const current = stack.pop()!;
        const node = unwrapNode(current);
        if (!node) {
            continue;
        }

        collectFailureFromNode(node, context, isOnPush, isCdrAlias, failures);

        for (const child of childNodes(node)) {
            stack.push(child);
        }
    }

    return failures;
}

/**
 * Appends a failure when the node is a discouraged manual CDR call.
 */
function collectFailureFromNode(
    node: AstNode,
    context: RuleContext,
    isOnPush: boolean,
    isCdrAlias: (name: string) => boolean,
    failures: RuleFailure[],
): void {
    const methodName = getDiscouragedMethodName(node);
    if (!methodName) {
        return;
    }

    if (!isTrackedCdrReceiver(node, isCdrAlias)) {
        return;
    }

    if (shouldSkipCall(methodName, isOnPush)) {
        return;
    }

    failures.push(createFailure(node, context, methodName, isOnPush));
}

/**
 *
 * Flags manual `ChangeDetectorRef` triggers in Angular components.
 * Allows `markForCheck()` in `OnPush` components.
 * Downgrades `detectChanges()` to `warn` in `OnPush` components.
 */
export const componentNoManualDetectChangesRule = createAnyAngularClassRule(
    RULE_NAME,
    (classNodeWrapper: AnyAngularClassNode, context: RuleContext): RuleFailure[] | null => {
        const classNode = classNodeWrapper.node as AstNode;

        if (!isAngularComponent(classNode)) {
            return null;
        }

        const explicitAliases = collectExplicitCdrAliases(classNode);
        const isCdrAlias = createCdrAliasMatcher(explicitAliases);
        const isOnPush = isOnPushComponent(classNode);

        const failures = findManualChangeDetectionFailures(
            classNode,
            context,
            isOnPush,
            isCdrAlias,
        );

        return failures.length > 0 ? failures : null;
    },
);