import { createAnyAngularClassRule } from '../engine/rule-handler.js';
import type { AnyAngularClassNode } from '../engine/node-streams.js';
import type { MethodDefinition, BlockStatement, Node, CallExpression } from '../ast/types.js';
import type { RuleContext, RuleFailure } from '../types.js';
import { RECOMMENDATIONS } from '../recommendations.js';

/**
 * signal-no-effect-in-constructor
 * 
 * Detects effect() calls inside the constructor of an Angular class.
 * Recommends moving them to field initializers.
 */
export const signalNoEffectInConstructorRule = createAnyAngularClassRule(
    'signal-no-effect-in-constructor',
    (streamNode: AnyAngularClassNode, context: RuleContext): RuleFailure | null => {
        const node = streamNode.node;
        const classBody = node.body?.body ?? [];

        // 1. Find the constructor
        const constructor = classBody.find(
            (m: any) =>
                m.type === 'MethodDefinition' &&
                (m.kind === 'constructor' || (m.key.type === 'Identifier' && m.key.name === 'constructor'))
        ) as MethodDefinition | undefined;

        if (!constructor) return null;

        // 2. Scan the constructor body for effect() calls
        const body = (constructor as any).value?.body as BlockStatement | undefined;
        if (!body) return null;

        const effectCall = findEffectCall(body);

        if (effectCall) {
            const start = effectCall.start ?? effectCall.span?.start ?? 0;
            const { line, column } = context.locator.location(start);

            return {
                filePath: context.filePath,
                ruleName: 'signal-no-effect-in-constructor',
                message: 'Move effect() from the constructor to a field initializer.',
                line,
                column,
                severity: 'low' as any,
                fix: RECOMMENDATIONS['signal-no-effect-in-constructor'],
            };
        }

        return null;
    }
);

function findEffectCall(node: Node): Node | null {
    if (!node) return null;

    if (node.type === 'BlockStatement') {
        const block = node as BlockStatement;
        for (const stmt of block.body) {
            const hit = findEffectCall(stmt);
            if (hit) return hit;
        }
    }

    if (node.type === 'ExpressionStatement') {
        return findEffectCall((node as any).expression);
    }

    if (node.type === 'CallExpression') {
        const call = node as CallExpression;
        const callee = call.callee;

        let isEffect = false;
        if (callee.type === 'Identifier') {
            isEffect = (callee as any).name === 'effect';
        } else if (callee.type === 'MemberExpression' || callee.type === 'StaticMemberExpression') {
            const member = callee as any;
            if (member.property && member.property.name === 'effect') {
                isEffect = true;
            }
        }

        if (isEffect) return node;

        // Scan arguments for nested effects (rare but possible)
        for (const arg of call.arguments) {
            const hit = findEffectCall(arg);
            if (hit) return hit;
        }
    }

    // Logic for other nodes (IfStatement, etc.) could be added but constructor effects 
    // are usually top-level expressions in the body.

    return null;
}
