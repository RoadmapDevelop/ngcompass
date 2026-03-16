import { AnyAngularClassNode } from '@ngcompass/ast';
import { RuleContext, RuleFailure } from '@ngcompass/common';
import { createAnyAngularClassRule } from '@ngcompass/engine';

import { CODE_EXAMPLES, RECOMMENDATIONS } from '../../recommendations';
import {
    AstNode,
    getClassBody,
    getNodeStart,
    getParamTypeName,
    getTsSymbolAtNode,
    unwrapNode,
} from '../../rule-utils';

const RULE_NAME = 'signal-prefer-output-function';

function isRelevantAngularDeclarationFile(filePath: string): boolean {
    return filePath.endsWith('.component.ts') || filePath.endsWith('.directive.ts');
}

function isOutputHostMember(node: AstNode): boolean {
    return node.type === 'PropertyDefinition' || node.type === 'AccessorProperty';
}

function unwrapDecoratorExpression(decorator: AstNode): AstNode | null {
    return unwrapNode(decorator.expression ?? decorator);
}

function getDecoratorName(decorator: AstNode): string | null {
    const expression = unwrapDecoratorExpression(decorator);
    if (!expression) {
        return null;
    }

    if (expression.type === 'Identifier') {
        return expression.name ?? null;
    }

    if (expression.type !== 'CallExpression') {
        return null;
    }

    const callee = unwrapNode(expression.callee);
    return callee?.type === 'Identifier' ? (callee.name ?? null) : null;
}

function isOutputDecorator(decorator: AstNode): boolean {
    return getDecoratorName(decorator) === 'Output';
}

function isOutputDecoratedMember(node: AstNode): boolean {
    if (!isOutputHostMember(node)) {
        return false;
    }

    const decorators = node.decorators;
    if (!Array.isArray(decorators) || decorators.length === 0) {
        return false;
    }

    return decorators.some(isOutputDecorator);
}

function getMemberName(node: AstNode): string {
    const key = unwrapNode(node.key as AstNode | undefined);

    if (key?.type === 'Identifier') {
        return key.name ?? '(unknown)';
    }

    if (key?.type === 'Literal') {
        return String(key.value);
    }

    return '(unknown)';
}

/**
 * Returns true when the node is `new EventEmitter(...)`.
 */
function isNewEventEmitterExpression(node: AstNode | null): boolean {
    if (!node || node.type !== 'NewExpression') {
        return false;
    }

    const callee = unwrapNode(node.callee);
    return callee?.type === 'Identifier' && callee.name === 'EventEmitter';
}

/**
 * Returns true when the member has an initializer of `new EventEmitter(...)`.
 */
function hasEventEmitterInitializer(member: AstNode): boolean {
    const value = unwrapNode(member.value as AstNode | undefined);
    return isNewEventEmitterExpression(value);
}

/**
 * Returns the declared type name for the member when statically known.
 */
function getDeclaredMemberTypeName(member: AstNode): string {
    const typeAnnotation = unwrapNode(member.typeAnnotation as AstNode | undefined);
    if (!typeAnnotation) {
        return '';
    }

    return getParamTypeName(typeAnnotation).trim();
}

/**
 * Returns true when the declared type text references `EventEmitter`.
 */
function hasEventEmitterTypeName(member: AstNode): boolean {
    const typeName = getDeclaredMemberTypeName(member);
    return Boolean(typeName) && typeName.includes('EventEmitter');
}

/**
 * Returns true when the member symbol resolves to an `EventEmitter` type.
 */
function hasEventEmitterTypeSymbol(member: AstNode, context: RuleContext): boolean {
    if (!context.typeChecker) {
        return false;
    }

    const symbol = getTsSymbolAtNode(member, context);
    if (!symbol) {
        return false;
    }

    const symbolName = typeof symbol.getName === 'function' ? symbol.getName() : '';
    if (symbolName === 'EventEmitter') {
        return true;
    }

    // Best-effort fallback for aliased / wrapped symbol names.
    return symbolName.includes('EventEmitter');
}

/**
 * Returns true when the decorated output also looks like an EventEmitter-based output.
 */
function isEventEmitterOutput(member: AstNode, context: RuleContext): boolean {
    return (
        hasEventEmitterInitializer(member) ||
        hasEventEmitterTypeName(member) ||
        hasEventEmitterTypeSymbol(member, context)
    );
}

type LegacyOutputMember = {
    node: AstNode;
    name: string;
};

function collectLegacyEventEmitterOutputs(
    classNode: AstNode,
    context: RuleContext,
): LegacyOutputMember[] {
    const outputs: LegacyOutputMember[] = [];

    for (const classMember of getClassBody(classNode)) {
        const member = unwrapNode(classMember);
        if (!member || !isOutputDecoratedMember(member)) {
            continue;
        }

        if (!isEventEmitterOutput(member, context)) {
            continue;
        }

        outputs.push({
            node: member,
            name: getMemberName(member),
        });
    }

    return outputs;
}

function buildFailureMessage(memberName: string): string {
    return (
        `'${memberName}' uses the legacy @Output() EventEmitter pattern. ` +
        'Prefer the `output()` function API (Angular 17.3+) for a more modern, idiomatic output declaration.'
    );
}

function createFailure(output: LegacyOutputMember, context: RuleContext): RuleFailure {
    const start = getNodeStart(output.node);
    const { line, column } = context.locator.location(start);

    return {
        filePath: context.filePath,
        ruleName: RULE_NAME,
        message: buildFailureMessage(output.name),
        line,
        column,
        severity: 'warn',
        fix: RECOMMENDATIONS[RULE_NAME],
        codeExample: CODE_EXAMPLES[RULE_NAME],
    };
}

/**
 * Flags legacy `@Output()` EventEmitter declarations and recommends
 * migrating to the Angular `output()` function API.
 */
export const signalPreferOutputFunctionRule = createAnyAngularClassRule(
    RULE_NAME,
    (classNodeWrapper: AnyAngularClassNode, context: RuleContext): RuleFailure[] | null => {
        if (!isRelevantAngularDeclarationFile(context.filePath)) {
            return null;
        }

        const classNode = classNodeWrapper.node as AstNode;
        const legacyOutputs = collectLegacyEventEmitterOutputs(classNode, context);
        if (legacyOutputs.length === 0) {
            return null;
        }

        return legacyOutputs.map(output => createFailure(output, context));
    },
);