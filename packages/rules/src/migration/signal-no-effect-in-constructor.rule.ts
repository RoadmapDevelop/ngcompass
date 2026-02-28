import { AnyAngularClassNode } from "@ngcompass/ast";
import { RuleFailure } from "@ngcompass/common";
import { createAnyAngularClassRule } from "../engine/rule-handler";
import { RECOMMENDATIONS } from "../recommendations";
import { AstNode, getClassBody, getConstructorMember, getMethodBody, findEffectCalls, getNodeStart } from "../rule-utils";
import { RuleContext } from "@ngcompass/common";

/**
 * Discourages creating `effect(...)` inside constructors of Angular-decorated classes.
 */
export const signalNoEffectInConstructorRule = createAnyAngularClassRule(
    'signal-no-effect-in-constructor',
    (streamNode: AnyAngularClassNode, context: RuleContext): RuleFailure[] | null => {
        const classNode = streamNode.node as any as AstNode;
        const classBody = getClassBody(classNode);
        if (classBody.length === 0) return null;

        const ctor = getConstructorMember(classBody);
        if (!ctor) return null;

        const body = getMethodBody(ctor);
        if (!body) return null;

        const effectCalls = findEffectCalls(body);
        if (!effectCalls.length) return null;

        const failures: RuleFailure[] = [];

        for (const effectCall of effectCalls) {
            const start = getNodeStart(effectCall);
            const { line, column } = context.locator.location(start);

            failures.push({
                filePath: context.filePath,
                ruleName: 'signal-no-effect-in-constructor',
                message: 'Move effect() from the constructor to a field initializer.',
                line,
                column,
                severity: 'low',
                fix: RECOMMENDATIONS['signal-no-effect-in-constructor'],
            });
        }

        return failures.length ? failures : null;
    }
);

