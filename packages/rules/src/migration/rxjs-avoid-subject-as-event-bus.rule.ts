import { AnyAngularClassNode } from "@ngcompass/ast";
import { RuleFailure } from "@ngcompass/common";
import { createAnyAngularClassRule } from "../engine/rule-handler";
import { RECOMMENDATIONS, CODE_EXAMPLES } from "../recommendations";
import { collectAllRxjsAliases, AstNode, unwrapNode, getStaticPropertyName, getClassBody, getNodeStart } from "../rule-utils";
import { RuleContext } from "@ngcompass/common";

const SUBJECT_TYPES = new Set(['Subject', 'ReplaySubject', 'AsyncSubject']);

const TEARDOWN_NAMES = new Set([
    'destroy$', 'destroyed$', 'ondestroy$', 'ngondestroy$',
    'unsubscribe$', 'unsub$', 'teardown$', 'dispose$',
    'cleanup$', 'cleanupsubject$',
]);

function lower(s: string): string {
    return s.toLowerCase();
}

/**
 * Builds a lookup map from every known constructor name (including import aliases)
 * to its canonical Subject type.
 *
 * Uses collectAllRxjsAliases() so the source text is scanned ONCE for all three
 * Subject types, replacing the previous pattern of three separate regex sweeps.
 *
 * @performance O(S × 2) instead of O(S × 2 × 3) — reduces 6 regex scans to 2.
 */
function collectSubjectConstructorNames(sourceText: string | undefined): Map<string, string> {
    const allAliases = collectAllRxjsAliases(sourceText, SUBJECT_TYPES);
    const nameToCanonicalType = new Map<string, string>();

    for (const [canonicalType, aliases] of allAliases) {
        for (const alias of aliases) {
            nameToCanonicalType.set(alias, canonicalType);
        }
    }

    return nameToCanonicalType;
}

function detectConstructedSubjectType(calleeRaw: AstNode | null | undefined, ctorNames: Map<string, string>): string | null {
    const callee = unwrapNode(calleeRaw);
    if (!callee) return null;
    if (callee.type === 'Identifier') {
        const name = (callee.name as string) ?? '';
        return ctorNames.get(name) ?? null;
    }
    if (callee.type === 'MemberExpression' || callee.type === 'StaticMemberExpression' || callee.type === 'OptionalMemberExpression') {
        const prop = getStaticPropertyName(callee);
        if (!prop) return null;
        return SUBJECT_TYPES.has(prop) ? prop : null;
    }
    return null;
}

/**
 * Discourages constructing RxJS Subject-like types in Angular components when they act as local event buses.
 * FIX: Uses top-down class scanning instead of .parent traversal.
 */
export const rxjsAvoidSubjectRule = createAnyAngularClassRule(
    'rxjs-avoid-subject-as-event-bus',
    (streamNode: AnyAngularClassNode, context: RuleContext): RuleFailure[] | null => {
        if (!context.filePath.endsWith('.component.ts')) return null;

        const classNode = streamNode.node as any as AstNode;
        const classBody = getClassBody(classNode);
        if (classBody.length === 0) return null;

        const sourceText: string | undefined = (context as any).sourceText;
        const ctorNames = collectSubjectConstructorNames(sourceText);

        const failures: RuleFailure[] = [];

        for (const member of classBody) {
            if (!member || member.type !== 'PropertyDefinition') continue;

            // Skip public fields
            if ((member.accessibility as string) === 'public') continue;

            const init = unwrapNode((member.value ?? member.initializer) as AstNode | undefined);
            if (!init || init.type !== 'NewExpression') continue;

            const detectedType = detectConstructedSubjectType(init.callee, ctorNames);
            if (!detectedType) continue;

            // Skip teardown subjects
            const key = member.key;
            const memberName = key?.type === 'Identifier' ? (key.name as string) :
                key?.type === 'Literal' && typeof key.value === 'string' ? key.value : '';
            if (memberName && TEARDOWN_NAMES.has(lower(memberName))) continue;

            const detail = memberName ? ` Offending member: ${memberName}.` : '';
            const start = getNodeStart(init);
            const { line, column } = context.locator.location(start);

            failures.push({
                filePath: context.filePath,
                ruleName: 'rxjs-avoid-subject-as-event-bus',
                message: `Avoid using ${detectedType} for local event streams in components. Prefer Signals or direct handlers for simpler lifecycle management.${detail}`,
                line,
                column,
                severity: 'moderate',
                fix: RECOMMENDATIONS['rxjs-avoid-subject-as-event-bus'],
                codeExample: CODE_EXAMPLES['rxjs-avoid-subject-as-event-bus'],
            });
        }

        return failures.length ? failures : null;
    }
);

