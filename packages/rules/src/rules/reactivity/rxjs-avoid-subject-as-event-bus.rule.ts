import { AnyAngularClassNode } from "@ngcompass/ast";
import { RuleFailure } from "@ngcompass/common";
import { createAnyAngularClassRule } from '@ngcompass/engine';
import { RECOMMENDATIONS, CODE_EXAMPLES } from "../../recommendations";
import { collectAllRxjsAliases, AstNode, MaybeAstNode, unwrapNode, getStaticPropertyName, getClassBody, getNodeStart, isMemberExpressionLike, isMethodDefinition, getMethodBody, childNodes } from "../../rule-utils";
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
 * @performance O(S ? 2) instead of O(S ? 2 ? 3) � reduces 6 regex scans to 2.
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

function detectConstructedSubjectType(calleeRaw: MaybeAstNode, ctorNames: Map<string, string>): string | null {
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
 * Scans a class body for `@Input()` setters that feed a Subject via `.next()`.
 *
 * This pattern — using a Subject as an RxJS bridge for Angular input changes —
 * is the only viable option when you need operators like `debounceTime` or `switchMap`
 * on an input without refactoring shared infrastructure. It is NOT an event-bus misuse.
 *
 * @example
 *   @Input() set searchQuery(val: string) { this.search$.next(val); }
 *   private search$ = new Subject<string>();  // ← should NOT be flagged
 *
 * Returns the set of Subject property names that are used exclusively as input bridges.
 */
function findInputBridgeSubjectNames(classBody: AstNode[]): Set<string> {
    const bridgeNames = new Set<string>();

    for (const member of classBody) {
        if (!member) continue;
        if (!isMethodDefinition(member)) continue;

        // Must be a setter method
        if ((member.kind as string) !== 'set') continue;

        // Must carry an @Input() decorator
        const decorators = Array.isArray(member.decorators)
            ? (member.decorators)
            : [];
        const hasInputDecorator = decorators.some((dec) => {
            // Decorator node may carry the expression directly or as a child
            const expr = unwrapNode((dec?.expression ?? dec) as AstNode | undefined);
            if (!expr) return false;
            if (expr.type === 'Identifier') return (expr.name as string) === 'Input';
            if (expr.type === 'CallExpression') {
                const callee = unwrapNode(expr.callee);
                return callee?.type === 'Identifier' && (callee.name as string) === 'Input';
            }
            return false;
        });
        if (!hasInputDecorator) continue;

        // Walk the setter body for `this.XYZ.next(...)` calls
        const body = getMethodBody(member);
        if (!body) continue;

        const stack: AstNode[] = [body];
        while (stack.length) {
            const n = stack.pop()!;
            if (!n) continue;

            if (n.type === 'CallExpression') {
                const callee = unwrapNode(n.callee);
                if (isMemberExpressionLike(callee) && getStaticPropertyName(callee) === 'next') {
                    const subjectExpr = unwrapNode(callee?.object);
                    if (isMemberExpressionLike(subjectExpr)) {
                        const thisNode = unwrapNode((subjectExpr as AstNode).object);
                        if (thisNode?.type === 'ThisExpression') {
                            const propName = getStaticPropertyName(subjectExpr);
                            if (propName) bridgeNames.add(propName);
                        }
                    }
                }
            }

            for (const child of childNodes(n)) stack.push(child);
        }
    }

    return bridgeNames;
}

/**
 * Discourages constructing RxJS Subject-like types in Angular components when they act as local event buses.
 * FIX: Uses top-down class scanning instead of .parent traversal.
 */
export const rxjsAvoidSubjectRule = createAnyAngularClassRule(
    'rxjs-avoid-subject-as-event-bus',
    (streamNode: AnyAngularClassNode, context: RuleContext): RuleFailure[] | null => {
        if (!context.filePath.endsWith('.component.ts')) return null;

        const classNode = streamNode.node as unknown as AstNode;
        const classBody = getClassBody(classNode);
        if (classBody.length === 0) return null;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sourceText: string | undefined = (context as any).sourceText;
        const ctorNames = collectSubjectConstructorNames(sourceText);

        // Build the set of Subject properties that are legitimately used as @Input() bridges.
        // These feed an RxJS pipeline (debounceTime, switchMap, etc.) from an input setter
        // and are the only viable pattern without refactoring shared infrastructure.
        const inputBridgeNames = findInputBridgeSubjectNames(classBody);

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

            // Skip Subjects used as @Input() setter bridges — feeding an RxJS pipeline
            // from an input setter is a valid and deliberate architecture choice.
            if (memberName && inputBridgeNames.has(memberName)) continue;

            const detail = memberName ? ` Offending member: ${memberName}.` : '';
            const start = getNodeStart(init);
            const { line, column } = context.locator.location(start);

            // Produce a context-specific message:
            // - If the Subject's name suggests reactive UI state → recommend signal()
            // - Otherwise → recommend encapsulating in a dedicated service
            const isLikelyUiState = memberName
                ? /state|loading|error|active|selected|open|visible|disabled|count|value|data/i.test(memberName)
                : false;

            const message = isLikelyUiState
                ? `Avoid using ${detectedType} for component UI state. Replace with a \`signal()\` for simpler, more performant reactivity.${detail}`
                : `Avoid using ${detectedType} as a component-internal event router. For simple user interactions, use direct method calls. For complex async pipelines, delegate to a service.${detail}`;

            failures.push({
                filePath: context.filePath,
                ruleName: 'rxjs-avoid-subject-as-event-bus',
                message,
                line,
                column,
                severity: 'warn',
                fix: RECOMMENDATIONS['rxjs-avoid-subject-as-event-bus'],
                codeExample: CODE_EXAMPLES['rxjs-avoid-subject-as-event-bus'],
            });
        }

        return failures.length ? failures : null;
    }
);

