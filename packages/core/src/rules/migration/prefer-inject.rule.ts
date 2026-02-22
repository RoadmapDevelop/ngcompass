import { AnyAngularClassNode } from "../engine/node-streams";
import { createAnyAngularClassRule } from "../engine/rule-handler";
import { RECOMMENDATIONS } from "../recommendations";
import { RuleContext, RuleFailure } from "../types";

export const preferInjectRule = createAnyAngularClassRule(
    'prefer-inject-over-constructor-di',
    (streamNode: AnyAngularClassNode, context: RuleContext): RuleFailure | null => {
        const node = streamNode.node;
        const classBody = node.body?.body ?? [];

        // 1. Better Constructor Finding
        const constructor = classBody.find(
            (m: any) =>
                m.type === 'MethodDefinition' &&
                (m.kind === 'constructor' || (m.key.type === 'Identifier' && m.key.name === 'constructor'))
        );

        if (!constructor) return null;

        // 2. Safer Parameter Access
        const funcValue = (constructor as any).value;
        // Some parsers use value.params (array), some use value.params.items (array)
        const params = funcValue?.params?.items ?? funcValue?.params ?? [];

        if (params.length > 0) {
            // Find the exact location of the constructor keyword or the start of params
            const start = constructor.key.span?.start ?? constructor.span?.start ?? 0;
            const { line, column } = context.locator.location(start);

            return {
                filePath: context.filePath,
                ruleName: 'prefer-inject-over-constructor-di',
                message: 'Use inject() instead of constructor for dependency injection.',
                line,
                column,
                severity: 'moderate',
                fix: RECOMMENDATIONS['prefer-inject-over-constructor-di'],
            };
        }

        return null;
    }
);