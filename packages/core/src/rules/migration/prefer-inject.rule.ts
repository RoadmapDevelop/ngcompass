import { AnyAngularClassNode } from "../engine/node-streams.js";
import { createAnyAngularClassRule } from "../engine/rule-handler.js";
import { RECOMMENDATIONS } from "../recommendations.js";
import { RuleContext, RuleFailure } from "../types.js";

/**
 * Returns true if a constructor parameter looks like an Angular DI injection.
 *
 * Heuristic: A parameter is considered injectable if it has:
 * - An accessibility modifier (private/public/protected/readonly) — the shorthand DI pattern
 * - A TypeAnnotation with a TypeReference (i.e., a class/interface type, not a primitive)
 * - A parameter decorator (@Inject, @Optional, @Self, etc.)
 *
 * This avoids false positives on constructors that accept primitive values
 * (e.g., string, number) which cannot be injected through DI.
 */
function looksLikeDIParam(param: any): boolean {
    // Shorthand property DI: constructor(private myService: MyService)
    if (param.accessibility || param.readonly) return true;

    // Parameter decorator: constructor(@Inject(TOKEN) value: MyToken)
    if (param.decorators && param.decorators.length > 0) return true;

    // Type annotation present and resolves to a TypeReference (class/interface, not primitive)
    const typeAnnotation = param.typeAnnotation ?? param.typeAnnotation;
    if (typeAnnotation) {
        const typeNode = typeAnnotation.typeAnnotation ?? typeAnnotation;
        // TypeReference = class/interface type (e.g., MyService, HttpClient)
        // TSTypeReference in some parsers, TypeReference in others
        if (typeNode.type === 'TSTypeReference' || typeNode.type === 'TypeReference') {
            return true;
        }
    }

    return false;
}

export const preferInjectRule = createAnyAngularClassRule(
    'prefer-inject-over-constructor-di',
    (streamNode: AnyAngularClassNode, context: RuleContext): RuleFailure | null => {
        const node = streamNode.node;
        const classBody = node.body?.body ?? [];

        // 1. Find the constructor
        const constructor = classBody.find(
            (m: any) =>
                m.type === 'MethodDefinition' &&
                (m.kind === 'constructor' || (m.key.type === 'Identifier' && m.key.name === 'constructor'))
        );

        if (!constructor) return null;

        // 2. Safer Parameter Access
        const funcValue = (constructor as any).value;
        // Some parsers use value.params (array), some use value.params.items (array)
        const params: any[] = funcValue?.params?.items ?? funcValue?.params ?? [];

        // 3. Only flag if at least one parameter looks like Angular DI injection.
        //    This prevents false positives on constructors with primitive parameters.
        const hasDIParams = params.some(looksLikeDIParam);

        if (hasDIParams) {
            const start = constructor.key.span?.start ?? constructor.span?.start ?? 0;
            const { line, column } = context.locator.location(start);

            return {
                filePath: context.filePath,
                ruleName: 'prefer-inject-over-constructor-di',
                message: 'Use inject() instead of constructor parameters for dependency injection.',
                line,
                column,
                severity: 'moderate',
                fix: RECOMMENDATIONS['prefer-inject-over-constructor-di'],
            };
        }

        return null;
    }
);
