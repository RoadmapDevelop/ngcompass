import { AnyAngularClassNode } from "@ngcompass/ast";
import { RuleFailure } from "@ngcompass/common";
import { createAnyAngularClassRule } from '@ngcompass/engine';
import { RECOMMENDATIONS, CODE_EXAMPLES } from "../../recommendations";
import { AstNode, MaybeAstNode, unwrapNode, getStaticPropertyName, getClassBody, collectRxjsAliases, getNodeStart } from "../../rule-utils";
import { RuleContext } from "@ngcompass/common";


function isBehaviorSubjectCallee(calleeRaw: MaybeAstNode, names: Set<string>): boolean {
    const callee = unwrapNode(calleeRaw);
    if (!callee) return false;
    if (callee.type === 'Identifier') return names.has((callee.name as string) ?? '');
    if (callee.type === 'MemberExpression' || callee.type === 'StaticMemberExpression' || callee.type === 'OptionalMemberExpression') {
        return getStaticPropertyName(callee) === 'BehaviorSubject';
    }
    return false;
}

function shouldAnalyzeFile(filePath: string): boolean {
    return filePath.endsWith('.component.ts') || filePath.endsWith('.service.ts');
}

/**
 * Discourages constructing RxJS BehaviorSubject in Angular components and services when used as local state.
 *
 * RULE-ACC-008: When `context.crossRef.templateReferences` is available (CTX-003), only flag
 * BehaviorSubject properties that are actually consumed by the component's own template.
 * This prevents false positives for BehaviorSubjects used as shared reactive streams, passed
 * to child components, or consumed by services — patterns where Signal conversion is
 * inappropriate or premature.
 *
 * Fallback: when cross-ref context is unavailable (services, worker-thread path), use the
 * original heuristic (flag all non-public BehaviorSubject properties in components/services).
 */
export const rxjsAvoidBehaviorSubjectRule = createAnyAngularClassRule(
    'rxjs-avoid-behaviorsubject-for-local-state',
    (streamNode: AnyAngularClassNode, context: RuleContext): RuleFailure[] | null => {
        if (!shouldAnalyzeFile(context.filePath)) return null;

        const classNode = streamNode.node as unknown as AstNode;
        const classBody = getClassBody(classNode);
        if (classBody.length === 0) return null;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sourceText: string | undefined = (context as any).sourceText;
        const behaviorSubjectNames = collectRxjsAliases(sourceText, 'BehaviorSubject');

        // RULE-ACC-008: Template cross-reference gate.
        // For component files, only flag BehaviorSubject properties that the template
        // actually binds to — these are the strongest candidates for Signal conversion.
        // `undefined` means cross-ref is unavailable; fall through to original behavior.
        const templateRefs = context.crossRef?.templateReferences;
        const isComponent = context.filePath.endsWith('.component.ts');

        const failures: RuleFailure[] = [];

        for (const member of classBody) {
            if (!member || member.type !== 'PropertyDefinition') continue;

            // Skip public fields (intentional API)
            if ((member.accessibility as string) === 'public') continue;

            const init = unwrapNode((member.value ?? member.initializer) as AstNode | undefined);
            if (!init || init.type !== 'NewExpression') continue;

            if (!isBehaviorSubjectCallee(init.callee, behaviorSubjectNames)) continue;

            const key = member.key;
            const memberName = key?.type === 'Identifier' ? (key.name as string) :
                key?.type === 'Literal' && typeof key.value === 'string' ? key.value : '';

            // RULE-ACC-008: For component files with cross-ref data, require the
            // BehaviorSubject to actually appear in the template (with or without `$` suffix).
            if (templateRefs !== undefined && isComponent) {
                const baseName = memberName.endsWith('$') ? memberName.slice(0, -1) : memberName;
                if (!templateRefs.has(memberName) && !templateRefs.has(baseName)) {
                    continue; // Not consumed in this template — might be shared reactive state
                }
            }

            const detail = memberName ? ` Offending member: ${memberName}.` : '';

            const start = getNodeStart(init);
            const { line, column } = context.locator.location(start);

            failures.push({
                filePath: context.filePath,
                ruleName: 'rxjs-avoid-behaviorsubject-for-local-state',
                message: `Avoid using BehaviorSubject for local state. Prefer Signals for better performance and simplicity.${detail}`,
                line,
                column,
                severity: 'warn',
                fix: RECOMMENDATIONS['rxjs-avoid-behaviorsubject-for-local-state'],
                codeExample: CODE_EXAMPLES['rxjs-avoid-behaviorsubject-for-local-state'],
            });
        }

        return failures.length ? failures : null;
    },
    { requires: { projectContext: true } }
);

