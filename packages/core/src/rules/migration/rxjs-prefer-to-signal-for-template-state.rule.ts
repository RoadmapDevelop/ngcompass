import { createAnyAngularClassRule } from '../engine/rule-handler.js';
import type { AnyAngularClassNode } from '../engine/node-streams.js';
import type { RuleContext, RuleFailure } from '../types.js';
import { RECOMMENDATIONS } from '../recommendations.js';
import {
    type AstNode,
    unwrapNode,
    getStaticPropertyName,
    getNodeStart,
    getClassBody,
    getCalleeName,
    childNodes,
} from '../rule-utils.js';

const TEARDOWN_NAMES = new Set([
    'destroy$', 'destroyed$', 'ondestroy$', 'ngondestroy$',
    'unsubscribe$', 'unsub$', 'teardown$', 'dispose$', 'cleanup$',
]);

const OBSERVABLE_TYPE_NAMES = new Set([
    'Observable', 'Subject', 'BehaviorSubject', 'ReplaySubject', 'AsyncSubject',
]);

function lower(s: string): string {
    return s.toLowerCase();
}

function getPropertyIdentifierName(member: AstNode): string {
    const key = member?.key;
    if (!key) return '';
    if (key.type === 'Identifier') return (key.name as string) ?? '';
    if (key.type === 'Literal' && typeof key.value === 'string') return key.value;
    return '';
}

function getTypeReferenceName(typeNode: AstNode | null | undefined): string {
    const t = unwrapNode(typeNode);
    if (!t) return '';
    if (t.type === 'TSTypeReference' || t.type === 'TypeReference') {
        const tn = t.typeName ?? t.name;
        if (tn && typeof tn === 'object') {
            if ((tn as AstNode).type === 'Identifier') return ((tn as AstNode).name as string) ?? '';
            if ((tn as AstNode).type === 'TSQualifiedName') return (((tn as AstNode).right as AstNode)?.name as string) ?? '';
        }
        if (typeof tn === 'string') return tn;
    }
    return '';
}

function isLikelyObservableByType(member: AstNode): boolean {
    const typeAnnotation = member?.typeAnnotation as AstNode | undefined;
    const typeNode = (typeAnnotation?.typeAnnotation ?? typeAnnotation) as AstNode | undefined;
    const name = getTypeReferenceName(typeNode);
    return Boolean(name) && OBSERVABLE_TYPE_NAMES.has(name);
}

/**
 * Checks whether an initializer expression contains a .pipe() call anywhere in its AST.
 *
 * Uses an explicit stack instead of recursion to avoid call-stack overflow on deeply
 * nested initializers and to guarantee O(N) single-pass traversal.
 */
function hasPipeCallInInitializer(init: AstNode | null | undefined): boolean {
    const root = unwrapNode(init);
    if (!root) return false;

    const stack: AstNode[] = [root];

    while (stack.length > 0) {
        const current = unwrapNode(stack.pop()!);
        if (!current) continue;

        if (current.type === 'CallExpression' && getCalleeName(current) === 'pipe') return true;

        for (const child of childNodes(current)) {
            stack.push(child);
        }
    }

    return false;
}

function isObservableConstructorNewExpression(init: AstNode | null | undefined): boolean {
    const node = unwrapNode(init);
    if (!node || node.type !== 'NewExpression') return false;
    const callee = unwrapNode(node.callee);
    if (!callee) return false;
    if (callee.type === 'Identifier') return OBSERVABLE_TYPE_NAMES.has((callee.name as string) ?? '');
    if (callee.type === 'MemberExpression' || callee.type === 'StaticMemberExpression' || callee.type === 'OptionalMemberExpression') {
        return OBSERVABLE_TYPE_NAMES.has(getStaticPropertyName(callee));
    }
    return false;
}

function isAlreadySignal(init: AstNode | null | undefined): boolean {
    const node = unwrapNode(init);
    if (!node || node.type !== 'CallExpression') return false;
    const calleeName = getCalleeName(node);
    return calleeName === 'toSignal' || calleeName === 'signal' || calleeName === 'computed';
}

function isLikelyObservable(member: AstNode): boolean {
    if (isLikelyObservableByType(member)) return true;
    const init = (member.value ?? member.initializer) as AstNode | undefined;
    if (!init) return false;
    if (isAlreadySignal(init)) return false;
    if (isObservableConstructorNewExpression(init)) return true;
    if (hasPipeCallInInitializer(init)) return true;
    return false;
}

function getDecoratorNames(classNode: AstNode): Set<string> {
    const names = new Set<string>();
    const decorators = classNode?.decorators;
    if (!Array.isArray(decorators)) return names;
    for (const d of decorators) {
        const expr = unwrapNode(d?.expression);
        if (!expr) continue;
        if (expr.type === 'CallExpression') {
            const callee = unwrapNode(expr.callee);
            if (callee?.type === 'Identifier' && callee.name) names.add(callee.name as string);
            continue;
        }
        if (expr.type === 'Identifier' && expr.name) names.add(expr.name as string);
    }
    return names;
}

function isComponentOrDirective(classNode: AstNode): boolean {
    const names = getDecoratorNames(classNode);
    return names.has('Component') || names.has('Directive');
}

/**
 * Suggests converting Observable-like class properties used for view-facing state to Signals via `toSignal()`.
 */
export const rxjsPreferToSignalRule = createAnyAngularClassRule(
    'rxjs-prefer-toSignal-for-template-state',
    (streamNode: AnyAngularClassNode, context: RuleContext): RuleFailure[] | null => {
        const classNode = streamNode.node as any as AstNode;
        if (!isComponentOrDirective(classNode)) return null;

        const classBody = getClassBody(classNode);
        if (classBody.length === 0) return null;

        const failures: RuleFailure[] = [];

        for (const member of classBody) {
            if (!member || member.type !== 'PropertyDefinition') continue;

            const propName = getPropertyIdentifierName(member);
            if (!propName || !propName.endsWith('$')) continue;

            if (TEARDOWN_NAMES.has(lower(propName))) continue;
            if (!isLikelyObservable(member)) continue;

            const offset = getNodeStart(member);
            const { line, column } = context.locator.location(offset);

            failures.push({
                filePath: context.filePath,
                ruleName: 'rxjs-prefer-toSignal-for-template-state',
                message: `Property "${propName}" appears to be Observable-like. Consider converting it to a Signal with toSignal() when used for template/view state.`,
                line,
                column,
                severity: 'low',
                fix: RECOMMENDATIONS['rxjs-prefer-toSignal-for-template-state'],
            });
        }

        return failures.length ? failures : null;
    }
);
