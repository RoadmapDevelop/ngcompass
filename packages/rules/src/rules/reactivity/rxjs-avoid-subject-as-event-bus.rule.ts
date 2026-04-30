import { AnyAngularClassNode } from "@ngcompass/ast";
import { RuleFailure, RuleContext } from "@ngcompass/common";
import { createAnyAngularClassRule } from '@ngcompass/engine';
import { RECOMMENDATIONS, CODE_EXAMPLES } from "../../recommendations";
import {
    collectAllRxjsAliases,
    AstNode,
    MaybeAstNode,
    unwrapNode,
    getStaticPropertyName,
    getClassBody,
    getNodeStart,
    isMemberExpressionLike,
    isMethodDefinition,
    getConstructorMember,
    getMethodBody,
    childNodes
} from "../../rule-utils";

const RULE_NAME = 'rxjs-avoid-subject-as-event-bus';
const SUBJECT_TYPES = new Set(['Subject', 'ReplaySubject', 'AsyncSubject', 'BehaviorSubject']);
const TEARDOWN_NAMES = new Set(['destroy$', 'destroyed$', 'ondestroy$', 'ngondestroy$', 'unsubscribe$', 'unsub$', 'teardown$', 'dispose$', 'cleanup$', 'cleanupsubject$']);
const UI_STATE_PATTERN = /state|loading|error|active|selected|open|visible|disabled|count|value|data|hidden|expanded|pending|success|failed/i;

function getAliasMap(context: RuleContext): Map<string, string> {
    const sourceText = (context as RuleContext & { sourceText?: string }).sourceText;
    const aliases = collectAllRxjsAliases(sourceText, SUBJECT_TYPES);
    const map = new Map<string, string>();
    for (const [type, names] of aliases) {
        for (const name of names) map.set(name, type);
    }
    return map;
}

function getSubjectType(callee: MaybeAstNode, aliases: Map<string, string>): string | null {
    const node = unwrapNode(callee);
    if (!node) return null;
    if (node.type === 'Identifier') return aliases.get(node.name as string) ?? null;
    if (isMemberExpressionLike(node)) {
        const prop = getStaticPropertyName(node);
        return prop && SUBJECT_TYPES.has(prop) ? prop : null;
    }
    return null;
}

function extractCalls(root: AstNode, methodName: string, found: Set<string>): void {
    const stack = [root];
    while (stack.length) {
        const n = unwrapNode(stack.pop());
        if (!n) continue;
        const callee = unwrapNode(n.callee);
        if (n.type === 'CallExpression' && getStaticPropertyName(callee) === methodName) {
            const obj = unwrapNode(callee?.object);
            if (obj && isMemberExpressionLike(obj) && unwrapNode(obj.object)?.type === 'ThisExpression') {
                const prop = getStaticPropertyName(obj);
                if (prop) found.add(prop);
            }
        }
        for (const child of childNodes(n)) stack.push(child);
    }
}

function getBridgeNames(classBody: AstNode[]): Set<string> {
    const names = new Set<string>();
    const ctor = getConstructorMember(classBody);
    if (ctor) {
        const body = getMethodBody(ctor);
        if (body) extractCalls(body, 'next', names);
    }

    for (const m of classBody) {
        if (isMethodDefinition(m)) {
            if (m.kind === 'set' && hasInputDecorator(m)) {
                extractCalls(m, 'next', names);
            }
            // ngOnChanges is a lifecycle bridge — .next() here is a legitimate pattern
            const keyName = m.key?.name;
            if (keyName === 'ngOnChanges') {
                const body = getMethodBody(m);
                if (body) extractCalls(body, 'next', names);
            }
            if (keyName === 'ngOnDestroy') {
                const body = getMethodBody(m);
                if (body) extractCalls(body, 'complete', names);
            }
        } else if (m.type === 'PropertyDefinition' && m.value) {
            extractCalls(m.value as AstNode, 'next', names);
        }
    }
    return names;
}

function hasInputDecorator(member: AstNode): boolean {
    const decorators = member.decorators;
    if (!Array.isArray(decorators)) return false;
    for (const d of decorators) {
        const expr = unwrapNode(d.expression);
        if (expr?.name === 'Input') return true;
        const callee = unwrapNode(expr?.callee);
        if (callee?.name === 'Input') return true;
    }
    return false;
}

function getSubjectsWithPipe(classBody: AstNode[]): Set<string> {
    const names = new Set<string>();
    for (const m of classBody) {
        const root = isMethodDefinition(m) ? getMethodBody(m) : (m.type === 'PropertyDefinition' ? m.value as AstNode : null);
        if (root) extractCalls(root, 'pipe', names);
    }
    return names;
}

export const rxjsAvoidSubjectRule = createAnyAngularClassRule(
    RULE_NAME,
    (streamNode: AnyAngularClassNode, context: RuleContext): RuleFailure[] | null => {
        if (!context.filePath.endsWith('.component.ts')) return null;

        const classBody = getClassBody(streamNode.node as unknown as AstNode);
        if (classBody.length === 0) return null;

        const aliases = getAliasMap(context);
        const bridgeNames = getBridgeNames(classBody);
        const pipeNames = getSubjectsWithPipe(classBody);
        const failures: RuleFailure[] = [];

        for (const m of classBody) {
            if (m.type !== 'PropertyDefinition' || m.accessibility === 'public') continue;

            const init = unwrapNode((m.value as AstNode | undefined) ?? m.initializer);
            if (!init || init.type !== 'NewExpression') continue;

            const type = getSubjectType(init.callee, aliases);
            const name = (m.key?.name) ?? '';
            if (!type || !name || TEARDOWN_NAMES.has(name.toLowerCase()) || bridgeNames.has(name) || pipeNames.has(name)) continue;

            const { line, column } = context.locator.location(getNodeStart(m));
            failures.push({
                filePath: context.filePath,
                ruleName: RULE_NAME,
                message: UI_STATE_PATTERN.test(name)
                    ? `${type} '${name}' is used for component UI state, which adds stream overhead to local state updates.`
                    : `${type} '${name}' is acting as a local event bus, which makes component interactions harder to trace.`,
                line,
                column,
                severity: 'warn',
                fix: RECOMMENDATIONS[RULE_NAME],
                codeExample: CODE_EXAMPLES[RULE_NAME],
            });
        }
        return failures.length ? failures : null;
    }
);
