import { createAnyAngularClassRule } from '../engine/rule-handler.js';
import type { AnyAngularClassNode } from '../engine/node-streams.js';
import type { MethodDefinition, BlockStatement, Node, CallExpression, ObjectExpression } from '../ast/types.js';
import type { RuleContext, RuleFailure } from '../types.js';
import { RECOMMENDATIONS } from '../recommendations.js';
import { hasObjectProperty } from '../ast/matchers.js';

/**
 * signal-effect-must-be-destroy-scoped
 *
 * Detects effect() calls inside regular methods (ngOnInit, etc.).
 * Angular effects require an injection context or a manual injector.
 *
 * Valid escape hatches (not flagged):
 *   - effect(fn, { injector: this.injector }) — explicit injector provided
 *   - effect(fn, { manualCleanup: true })     — developer takes manual ownership
 */
export const signalEffectDestroyScopedRule = createAnyAngularClassRule(
    'signal-effect-must-be-destroy-scoped',
    (streamNode: AnyAngularClassNode, context: RuleContext): RuleFailure | null => {
        const node = streamNode.node;
        const classBody = node.body?.body ?? [];

        // Find all methods EXCEPT the constructor
        const methods = classBody.filter(
            (m: any) =>
                m.type === 'MethodDefinition' &&
                m.kind !== 'constructor' &&
                !(m.key.type === 'Identifier' && m.key.name === 'constructor')
        ) as MethodDefinition[];

        for (const method of methods) {
            const body = (method as any).value?.body as BlockStatement | undefined;
            if (!body) continue;

            const effectCall = findEffectCall(body);
            if (effectCall) {
                const start = effectCall.start ?? effectCall.span?.start ?? 0;
                const { line, column } = context.locator.location(start);

                return {
                    filePath: context.filePath,
                    ruleName: 'signal-effect-must-be-destroy-scoped',
                    message: `effect() called inside "${(method.key as any).name}". Effects must be created in an injection context (constructor or field initializer) or provided with a DestroyRef/injector option.`,
                    line,
                    column,
                    severity: 'high',
                    fix: RECOMMENDATIONS['signal-effect-must-be-destroy-scoped'],
                };
            }
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

        if (isEffect) {
            // Allow effect() calls that provide { injector } or { manualCleanup: true }
            // as the second argument — these are valid lifecycle management patterns.
            const optionsArg = call.arguments[1];
            if (optionsArg && optionsArg.type === 'ObjectExpression') {
                const options = optionsArg as ObjectExpression;
                if (hasObjectProperty(options, 'injector') || hasObjectProperty(options, 'manualCleanup')) {
                    return null;
                }
            }
            return node;
        }

        for (const arg of call.arguments) {
            const hit = findEffectCall(arg);
            if (hit) return hit;
        }
    }

    return null;
}
