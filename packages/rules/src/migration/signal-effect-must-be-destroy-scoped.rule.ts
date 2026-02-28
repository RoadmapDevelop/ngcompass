import { AnyAngularClassNode } from "@ngcompass/ast";
import { RuleFailure } from "@ngcompass/common";
import { createAnyAngularClassRule } from "../engine/rule-handler";
import { RECOMMENDATIONS } from "../recommendations";
import { AstNode, getClassBody, isMethodDefinition, isConstructorMethod, getMethodBody, findEffectCalls, getMethodName, getNodeStart } from "../rule-utils";
import { RuleContext } from "@ngcompass/common";

/**
 * Flags `effect(...)` calls inside non-constructor methods unless lifecycle ownership is explicit.
 */
export const signalEffectDestroyScopedRule = createAnyAngularClassRule(
    'signal-effect-must-be-destroy-scoped',
    (streamNode: AnyAngularClassNode, context: RuleContext): RuleFailure[] | null => {
        const classNode = streamNode.node as any as AstNode;
        const classBody = getClassBody(classNode);
        if (classBody.length === 0) return null;

        const failures: RuleFailure[] = [];

        for (const member of classBody) {
            if (!member) continue;
            if (!isMethodDefinition(member)) continue;
            if (isConstructorMethod(member)) continue;

            const body = getMethodBody(member);
            if (!body) continue;

            const effectCalls = findEffectCalls(body);
            if (!effectCalls.length) continue;

            const methodName = getMethodName(member);

            for (const effectCall of effectCalls) {
                const start = getNodeStart(effectCall);
                const { line, column } = context.locator.location(start);

                failures.push({
                    filePath: context.filePath,
                    ruleName: 'signal-effect-must-be-destroy-scoped',
                    message:
                        `effect() called inside "${methodName}". Create effects in an injection context (constructor/field initializer) or pass { injector } / { manualCleanup: true } for explicit lifecycle ownership.`,
                    line,
                    column,
                    severity: 'high',
                    fix: RECOMMENDATIONS['signal-effect-must-be-destroy-scoped'],
                });
            }
        }

        return failures.length ? failures : null;
    }
);

