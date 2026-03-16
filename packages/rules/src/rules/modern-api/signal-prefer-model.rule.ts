import { AnyAngularClassNode } from '@ngcompass/ast';
import { RuleContext, RuleFailure } from '@ngcompass/common';
import { createAnyAngularClassRule } from '@ngcompass/engine';

import { CODE_EXAMPLES, RECOMMENDATIONS } from '../../recommendations';
import {
    AstNode,
    getClassBody,
    getNodeStart,
    isMemberExpressionLike,
    unwrapNode,
} from '../../rule-utils';

const RULE_NAME = 'signal-prefer-model';

type DecoratedMember = {
    node: AstNode;
    name: string;
};

type TwoWayBindingPair = {
    input: DecoratedMember;
    output: DecoratedMember;
};

function isRelevantAngularDeclarationFile(filePath: string): boolean {
    return filePath.endsWith('.component.ts') || filePath.endsWith('.directive.ts');
}

/**
 * Returns true when the node can host Angular input/output decorators.
 */
function isDecoratableMember(node: AstNode): boolean {
    return node.type === 'PropertyDefinition' || node.type === 'AccessorProperty';
}

/**
 * Returns the resolved decorator expression.
 */
function unwrapDecoratorExpression(decorator: AstNode): AstNode | null {
    return unwrapNode(decorator.expression ?? decorator);
}

/**
 * Returns the decorator name for forms like `@Input` and `@Input()`.
 */
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
    return callee?.type === 'Identifier' ? callee.name ?? null : null;
}

/**
 * Returns true when the member is decorated with the given decorator name.
 */
function hasDecorator(member: AstNode, decoratorName: string): boolean {
    if (!isDecoratableMember(member)) {
        return false;
    }

    const decorators = member.decorators;
    if (!Array.isArray(decorators) || decorators.length === 0) {
        return false;
    }

    return decorators.some(decorator => getDecoratorName(decorator) === decoratorName);
}

/**
 * Returns true when the node is a call expression for the given signal name.
 * Handles both direct calls (`input()`) and members (`input.required()`).
 */
function isSignalCall(node: AstNode | null | undefined, signalName: string): boolean {
    const unwrapped = unwrapNode(node);
    if (!unwrapped || unwrapped.type !== 'CallExpression') {
        return false;
    }

    const callee = unwrapNode(unwrapped.callee);
    if (!callee) return false;

    if (callee.type === 'Identifier') {
        return callee.name === signalName;
    }

    if (isMemberExpressionLike(callee)) {
        const object = unwrapNode(callee.object);
        return object?.type === 'Identifier' && object.name === signalName;
    }

    return false;
}

/**
 * Returns true when the member is initialized with the given signal name.
 */
function hasSignalInitialization(member: AstNode, signalName: string): boolean {
    if (!isDecoratableMember(member)) {
        return false;
    }
    return isSignalCall(member.value as AstNode, signalName);
}

/**
 * Returns the declared property name when statically known.
 */
function getMemberName(member: AstNode): string | null {
    const key = unwrapNode(member.key as AstNode | undefined);
    if (!key) {
        return null;
    }

    if (key.type === 'Identifier') {
        return key.name ?? null;
    }

    if (key.type === 'Literal') {
        return String(key.value);
    }

    return null;
}

/**
 * Collects input or output members declared via either decorators or signals.
 */
function collectBindingMembers(classNode: AstNode, decoratorName: string): DecoratedMember[] {
    const members: DecoratedMember[] = [];
    const signalName = decoratorName.toLowerCase();

    for (const classMember of getClassBody(classNode)) {
        const member = unwrapNode(classMember);
        if (!member) {
            continue;
        }

        const isDecorated = hasDecorator(member, decoratorName);
        const isSignal = hasSignalInitialization(member, signalName);

        if (!isDecorated && !isSignal) {
            continue;
        }

        const name = getMemberName(member);
        if (!name) {
            continue;
        }

        members.push({ node: member, name });
    }

    return members;
}

/**
 * Returns all input members indexed by property name.
 */
function collectInputMembersByName(classNode: AstNode): Map<string, DecoratedMember> {
    const inputs = collectBindingMembers(classNode, 'Input');
    const inputsByName = new Map<string, DecoratedMember>();

    for (const input of inputs) {
        inputsByName.set(input.name, input);
    }

    return inputsByName;
}

/**
 * Returns all output members.
 */
function collectOutputMembers(classNode: AstNode): DecoratedMember[] {
    return collectBindingMembers(classNode, 'Output');
}

/**
 * Returns the base input name for an output named `fooChange`.
 */
function getTwoWayBindingBaseName(outputName: string): string | null {
    if (!outputName.endsWith('Change')) {
        return null;
    }

    return outputName.slice(0, -'Change'.length);
}

/**
 * Collects `@Input() foo` + `@Output() fooChange` pairs.
 * Emits at most one pair per input name.
 */
function collectTwoWayBindingPairs(classNode: AstNode): TwoWayBindingPair[] {
    const inputsByName = collectInputMembersByName(classNode);
    if (inputsByName.size === 0) {
        return [];
    }

    const outputs = collectOutputMembers(classNode);
    const pairs: TwoWayBindingPair[] = [];
    const reportedInputNames = new Set<string>();

    for (const output of outputs) {
        const baseName = getTwoWayBindingBaseName(output.name);
        if (!baseName || reportedInputNames.has(baseName)) {
            continue;
        }

        const input = inputsByName.get(baseName);
        if (!input) {
            continue;
        }

        pairs.push({ input, output });
        reportedInputNames.add(baseName);
    }

    return pairs;
}

/**
 * Builds the lint message for a detected two-way binding pair.
 */
function buildFailureMessage(pair: TwoWayBindingPair): string {
    return (
        `The \`${pair.input.name}\` / \`${pair.output.name}\` pair implements two-way binding. ` +
        'Prefer the `model()` signal API (Angular 17.2+) for simpler, idiomatic two-way data flow.'
    );
}

/**
 * Creates a rule failure for a detected two-way binding pair.
 */
function createFailure(pair: TwoWayBindingPair, context: RuleContext): RuleFailure {
    const start = getNodeStart(pair.input.node);
    const { line, column } = context.locator.location(start);

    return {
        filePath: context.filePath,
        ruleName: RULE_NAME,
        message: buildFailureMessage(pair),
        line,
        column,
        severity: 'warn',
        fix: RECOMMENDATIONS[RULE_NAME],
        codeExample: CODE_EXAMPLES[RULE_NAME],
    };
}

/**
 * Detects the `@Input() x + @Output() xChange` pattern and recommends
 * migrating to the Angular `model()` signal API.
 */
export const signalPreferModelRule = createAnyAngularClassRule(
    RULE_NAME,
    (classNodeWrapper: AnyAngularClassNode, context: RuleContext): RuleFailure[] | null => {
        if (!isRelevantAngularDeclarationFile(context.filePath)) {
            return null;
        }

        const classNode = classNodeWrapper.node as AstNode;
        const pairs = collectTwoWayBindingPairs(classNode);
        if (pairs.length === 0) {
            return null;
        }

        const failures = pairs.map(pair => createFailure(pair, context));
        return failures.length > 0 ? failures : null;
    },
);