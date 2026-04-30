import { AnyAngularClassNode } from "@ngcompass/ast";
import { RuleFailure, RuleContext } from "@ngcompass/common";
import { createAnyAngularClassRule } from '@ngcompass/engine';
import { RECOMMENDATIONS } from "../../recommendations";
import {
    AstNode,
    unwrapNode,
    getCalleeName,
    childNodes,
    getStaticPropertyName,
    getClassBody,
    getNodeStart
} from "../../rule-utils";

const RULE_NAME = 'rxjs-prefer-toSignal-for-template-state';
const OBSERVABLE_TYPES = new Set(['Observable', 'Subject', 'BehaviorSubject', 'ReplaySubject', 'AsyncSubject']);
const TEARDOWN_NAMES = new Set(['destroy$', 'destroyed$', 'unsub$', 'teardown$', 'dispose$']);

function isOutputMember(member: AstNode): boolean {
    const modifiers = member.modifiers as ReadonlyArray<AstNode> | undefined;
    const decorators = (member.decorators as ReadonlyArray<AstNode> | undefined) ??
        (Array.isArray(modifiers) ? modifiers.filter((m) => m.type === 'Decorator') : undefined);
    return Array.isArray(decorators) && decorators.some(d => {
        const expr = unwrapNode(d.expression);
        const name = expr?.type === 'CallExpression' ? getCalleeName(expr) : (expr?.type === 'Identifier' ? expr.name : null);
        return name === 'Output';
    });
}

function getTypeName(member: AstNode): string {
    const typeAnn = member.typeAnnotation;
    const typeNode = unwrapNode(typeAnn?.typeAnnotation);
    if (!typeNode || (typeNode.type !== 'TSTypeReference' && typeNode.type !== 'TypeReference')) return '';

    const tn = typeNode.typeName ?? (typeNode.name as AstNode | string | undefined);
    if (typeof tn === 'string') return tn;
    if (tn && typeof tn === 'object') {
        const tnNode = tn;
        if (tnNode.type === 'Identifier') return (tnNode.name) ?? '';
        if (tnNode.type === 'TSQualifiedName') return unwrapNode(tnNode.right)?.name as string ?? '';
    }
    return '';
}

function isObservableSource(member: AstNode): boolean {
    if (OBSERVABLE_TYPES.has(getTypeName(member))) return true;

    const init = unwrapNode((member.value as AstNode | undefined) ?? member.initializer);
    if (!init) return false;

    const callee = getCalleeName(init);
    if (callee === 'toSignal' || callee === 'signal' || callee === 'computed') return false;

    if (init.type === 'NewExpression') {
        const ctor = unwrapNode(init.callee);
        const name = ctor?.type === 'Identifier' ? ctor.name : getStaticPropertyName(ctor);
        return !!name && OBSERVABLE_TYPES.has(name);
    }

    const stack = [init];
    while (stack.length > 0) {
        const curr = unwrapNode(stack.pop());
        if (!curr) continue;
        if (curr.type === 'CallExpression' && getCalleeName(curr) === 'pipe') return true;
        for (const child of childNodes(curr)) stack.push(child);
    }
    return false;
}

export const rxjsPreferToSignalRule = createAnyAngularClassRule(
    RULE_NAME,
    (streamNode: AnyAngularClassNode, context: RuleContext): RuleFailure[] | null => {
        const meta = (streamNode as unknown as { metadata?: { type?: string } }).metadata;
        if (meta?.type !== 'Component') return null;

        const templateRefs = context.crossRef?.templateReferences;
        if (templateRefs === undefined) return null;

        const classBody = getClassBody(streamNode.node as unknown as AstNode);
        const failures: RuleFailure[] = [];

        for (const member of classBody) {
            if (member.type !== 'PropertyDefinition') continue;

            const name = (member.key?.name) ?? '';
            if (!name || !name.endsWith('$') || TEARDOWN_NAMES.has(name.toLowerCase())) continue;
            if (isOutputMember(member)) continue;

            const baseName = name.slice(0, -1);
            if (!templateRefs.has(name) && !templateRefs.has(baseName)) continue;
            if (!isObservableSource(member)) continue;

            const { line, column } = context.locator.location(getNodeStart(member));
            failures.push({
                filePath: context.filePath,
                ruleName: RULE_NAME,
                message: `Observable "${name}" is read by the template, which can add async-pipe churn and weaker signal integration.`,
                line,
                column,
                severity: 'warn',
                fix: RECOMMENDATIONS[RULE_NAME],
            });
        }

        return failures.length ? failures : null;
    },
    { requires: { projectContext: true, htmlAst: true } }
);
