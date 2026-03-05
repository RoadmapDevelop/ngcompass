import { AnyAngularClassNode } from "@ngcompass/ast";
import { RuleFailure } from "@ngcompass/common";
import { createAnyAngularClassRule } from '@ngcompass/engine';
import { RECOMMENDATIONS, CODE_EXAMPLES } from "../recommendations";
import { AstNode, unwrapNode, getStaticPropertyName, getClassBody, collectRxjsAliases, getNodeStart } from "../rule-utils";
import { RuleContext } from "@ngcompass/common";


function isBehaviorSubjectCallee(calleeRaw: AstNode | null | undefined, names: Set<string>): boolean {
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
 * FIX: Uses top-down class scanning instead of .parent traversal.
 */
export const rxjsAvoidBehaviorSubjectRule = createAnyAngularClassRule(
    'rxjs-avoid-behaviorsubject-for-local-state',
    (streamNode: AnyAngularClassNode, context: RuleContext): RuleFailure[] | null => {
        if (!shouldAnalyzeFile(context.filePath)) return null;

        const classNode = streamNode.node as any as AstNode;
        const classBody = getClassBody(classNode);
        if (classBody.length === 0) return null;

        const sourceText: string | undefined = (context as any).sourceText;
        const behaviorSubjectNames = collectRxjsAliases(sourceText, 'BehaviorSubject');

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
    }
);

