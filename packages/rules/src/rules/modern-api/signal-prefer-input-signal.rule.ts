import { AnyAngularClassNode } from '@ngcompass/ast';
import { RuleContext, RuleFailure } from '@ngcompass/common';
import { createAnyAngularClassRule } from '@ngcompass/engine';

import { CODE_EXAMPLES, RECOMMENDATIONS } from '../../recommendations';
import {
    AstNode,
    getClassBody,
    getNodeStart,
    unwrapNode,
} from '../../rule-utils';

const RULE_NAME = 'signal-prefer-input-signal';

function isRelevantAngularDeclarationFile(filePath: string): boolean {
    return filePath.endsWith('.component.ts') || filePath.endsWith('.directive.ts');
}

/**
 * Returns true when the node can declare an Angular input decorator.
 */
function isInputHostMember(node: AstNode): boolean {
    return node.type === 'PropertyDefinition' || node.type === 'AccessorProperty';
}

/**
 * Returns true when the decorator expression resolves to `Input` or `Input()`.
 */
function isInputDecorator(node: AstNode): boolean {
    const resolved = unwrapDecoratorExpression(node);
    if (!resolved) {
        return false;
    }

    if (resolved.type === 'Identifier') {
        return resolved.name === 'Input';
    }

    if (resolved.type !== 'CallExpression') {
        return false;
    }

    const callee = unwrapNode(resolved.callee);
    return callee?.type === 'Identifier' && callee.name === 'Input';
}

/**
 * Unwraps a decorator to the meaningful expression being applied.
 */
function unwrapDecoratorExpression(node: AstNode): AstNode | null {
    const expression = unwrapNode(node.expression ?? node);
    if (!expression) {
        return null;
    }

    return expression;
}

/**
 * Returns true when the member is decorated with `@Input` or `@Input()`.
 */
function isInputDecoratedMember(node: AstNode): boolean {
    if (!isInputHostMember(node)) {
        return false;
    }

    const decorators = node.decorators;
    if (!Array.isArray(decorators) || decorators.length === 0) {
        return false;
    }

    return decorators.some(isInputDecorator);
}

/**
 * Collects all members using the legacy `@Input()` decorator.
 */
function collectLegacyInputMembers(classNode: AstNode): AstNode[] {
    const legacyInputs: AstNode[] = [];

    for (const member of getClassBody(classNode)) {
        const node = unwrapNode(member);
        if (!node || !isInputDecoratedMember(node)) {
            continue;
        }

        legacyInputs.push(node);
    }

    return legacyInputs;
}

/**
 * Returns the declared member name when available.
 */
function getMemberName(node: AstNode): string {
    const key = unwrapNode(node.key as AstNode | undefined);
    if (key?.type === 'Identifier') {
        return key.name ?? '(unknown)';
    }

    return '(unknown)';
}

/**
 * Returns true when the current file is tracked as a standalone Angular declaration.
 */
function isStandaloneDeclaration(context: RuleContext): boolean {
    return context.project?.standaloneComponents?.has(context.filePath) ?? false;
}

/**
 * Builds the lint message for a legacy `@Input()` usage.
 */
function buildFailureMessage(memberName: string, isStandalone: boolean): string {
    const baseMessage =
        `'${memberName}' uses the legacy @Input() decorator. ` +
        'Prefer the signal-based `input()` / `input.required()` API (Angular 17.1+).';

    if (!isStandalone) {
        return baseMessage;
    }

    return (
        baseMessage +
        ' This is a standalone declaration, where signal inputs are the preferred modern API.'
    );
}

/**
 * Creates a rule failure for a legacy `@Input()` declaration.
 */
function createFailure(
    node: AstNode,
    context: RuleContext,
    isStandalone: boolean,
): RuleFailure {
    const start = getNodeStart(node);
    const { line, column } = context.locator.location(start);

    return {
        filePath: context.filePath,
        ruleName: RULE_NAME,
        message: buildFailureMessage(getMemberName(node), isStandalone),
        line,
        column,
        severity: isStandalone ? 'error' : 'warn',
        fix: RECOMMENDATIONS[RULE_NAME],
        codeExample: CODE_EXAMPLES[RULE_NAME],
    };
}

/**
 * Flags legacy `@Input()` declarations and recommends migrating to the
 * signal-based `input()` / `input.required()` API.
 */
export const signalPreferInputSignalRule = createAnyAngularClassRule(
    RULE_NAME,
    (classNodeWrapper: AnyAngularClassNode, context: RuleContext): RuleFailure[] | null => {
        if (!isRelevantAngularDeclarationFile(context.filePath)) {
            return null;
        }

        const classNode = classNodeWrapper.node as AstNode;
        const legacyInputMembers = collectLegacyInputMembers(classNode);
        if (legacyInputMembers.length === 0) {
            return null;
        }

        const standalone = isStandaloneDeclaration(context);
        const failures = legacyInputMembers.map(member =>
            createFailure(member, context, standalone),
        );

        return failures.length > 0 ? failures : null;
    },
    { requires: { projectContext: true } },
);