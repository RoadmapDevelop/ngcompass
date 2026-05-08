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
    'cdr', 'cdref', 'changedetectorref', '_cdr', '_cdref',
    'changedetector', '_changedetector', 'changedetectionref', 'cd', '_cd',
]);

function isInjectChangeDetectorRefCall(node: AstNode): boolean {
    if (node.type !== 'CallExpression') return false;

    const callee = unwrapNode(node.callee);
    if (callee?.type !== 'Identifier' || callee.name !== 'inject') return false;

    const [firstArg] = node.arguments ?? [];
    const token = unwrapNode(firstArg);

    return token?.type === 'Identifier' && token.name === 'ChangeDetectorRef';
}

function isChangeDetectorRefParam(param: AstNode): boolean {
    return getParamTypeName(param) === 'ChangeDetectorRef';
}

function collectExplicitCdrAliases(classNode: AstNode): Set<string> {
    const aliases = new Set<string>();
    const classBody = getClassBody(classNode);

    const ctor = getConstructorMember(classBody);
    if (ctor) {
        const ctorValue = (ctor.value ?? ctor) as AstNode;
        for (const param of getParamsArray(ctorValue)) {
            if (isChangeDetectorRefParam(param)) {
                const alias = getParamIdentifierName(param);
                if (alias) aliases.add(alias);
            }
        }
    }

    for (const member of classBody) {
        if (member.type === 'PropertyDefinition' && member.value) {
            const value = unwrapNode(member.value as AstNode);
            if (value && isInjectChangeDetectorRefCall(value)) {
                const key = member.key;
                if (key?.type === 'Identifier') {
                    aliases.add(key.name as string);
                }
            }
        }
    }

    return aliases;
}

function getComponentMetadata(classNode: AstNode) {
    return analyzeComponent(classNode as never);
}

function isOnPushComponent(classNode: AstNode): boolean {
    const metadata = getComponentMetadata(classNode);
    return (
        metadata?.type === 'Component' &&
        metadata.changeDetection?.kind === 'literal' &&
        metadata.changeDetection.value === ChangeDetectionStrategy.OnPush
    );
}

function isAngularComponent(classNode: AstNode): boolean {
    return getComponentMetadata(classNode)?.type === 'Component';
}

function createCdrAliasMatcher(explicitAliases: Set<string>): (name: string) => boolean {
    const hasExplicitAliases = explicitAliases.size > 0;
    return (name: string): boolean => {
        if (explicitAliases.has(name)) return true;
        if (hasExplicitAliases) return false;
        return HEURISTIC_CDR_NAMES.has(name.toLowerCase());
    };
}

function getDiscouragedMethodName(node: AstNode): string | null {
    if (node.type !== 'CallExpression') return null;

    const callee = unwrapNode(node.callee);
    if (!isMemberExpressionLike(callee)) return null;

    const methodName = getStaticPropertyName(callee);
    return methodName && DISCOURAGED_CDR_METHODS.has(methodName) ? methodName : null;
}

function isTrackedCdrReceiver(callNode: AstNode, isCdrAlias: (name: string) => boolean): boolean {
    if (callNode.type !== 'CallExpression') return false;

    const callee = unwrapNode(callNode.callee);
    if (!callee || !isMemberExpressionLike(callee)) return false;

    const target = unwrapNode(callee.object);
    if (!target) return false;

    if (target.type === 'Identifier') return isCdrAlias(target.name as string);

    if (!isMemberExpressionLike(target)) return false;

    const receiver = unwrapNode(target.object);
    const propertyName = getStaticPropertyName(target);
    const isThis = receiver?.type === 'ThisExpression' || (receiver?.type === 'Identifier' && receiver.name === 'this');

    return isThis && !!propertyName && isCdrAlias(propertyName);
}

function buildFailureMessage(methodName: string, isOnPush: boolean): string {
    if (isOnPush) {
        return 'Manual change detection in an OnPush component couples rendering to imperative calls.';
    }
    return `Manual change detection (${methodName}) can hide state-flow bugs and make rendering harder to predict.`;
}

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

function findManualChangeDetectionFailures(
    classNode: AstNode,
    context: RuleContext,
    isOnPush: boolean,
    isCdrAlias: (name: string) => boolean,
): RuleFailure[] {
    const failures: RuleFailure[] = [];
    const stack: AstNode[] = [...getClassBody(classNode)];

    while (stack.length > 0) {
        const node = unwrapNode(stack.pop());
        if (!node) continue;

        const methodName = getDiscouragedMethodName(node);
        if (methodName && isTrackedCdrReceiver(node, isCdrAlias)) {
            const skipCheckpoint = isOnPush && methodName === 'markForCheck';
            if (!skipCheckpoint) {
                failures.push(createFailure(node, context, methodName, isOnPush));
            }
        }

        for (const child of childNodes(node)) {
            stack.push(child);
        }
    }

    return failures;
}

export const componentNoManualDetectChangesRule = createAnyAngularClassRule(
    RULE_NAME,
    (classNodeWrapper: AnyAngularClassNode, context: RuleContext): RuleFailure[] | null => {
        const classNode = classNodeWrapper.node as AstNode;

        if (!isAngularComponent(classNode)) return null;

        const explicitAliases = collectExplicitCdrAliases(classNode);
        const isCdrAlias = createCdrAliasMatcher(explicitAliases);
        const isOnPush = isOnPushComponent(classNode);

        const failures = findManualChangeDetectionFailures(classNode, context, isOnPush, isCdrAlias);
        return failures.length > 0 ? failures : null;
    },
);
