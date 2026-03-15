import { RuleFailure } from "@ngcompass/common";
import { CallExpression } from "@ngcompass/ast";
import { createCallExpressionRule } from '@ngcompass/engine';
import { RECOMMENDATIONS, CODE_EXAMPLES } from "../../recommendations";
import { AstNode, unwrapNode, isMemberExpressionLike, getStaticPropertyName, getNodeStart, childNodes } from "../../rule-utils";
import { RuleContext } from "@ngcompass/common";

function isSubscribeCall(node: AstNode): boolean {
    const callee = unwrapNode(node.callee);
    if (!isMemberExpressionLike(callee)) return false;
    return getStaticPropertyName(callee) === 'subscribe';
}

/**
 * Recursively searches function body nodes for a nested `.subscribe()` call.
 * Stops at function-boundary nodes to avoid false positives from callbacks
 * in unrelated async operations.
 */
function containsNestedSubscribe(body: AstNode): boolean {
    const stack: AstNode[] = [body];

    while (stack.length) {
        const node = stack.pop()!;
        const n = unwrapNode(node);
        if (!n) continue;

        if (n.type === 'CallExpression' && isSubscribeCall(n)) {
            return true;
        }

        // Don't recurse into nested function scopes — those are independent
        // subscriptions and shouldn't be flagged as "nested" inside this one.
        if (
            n.type === 'ArrowFunctionExpression' ||
            n.type === 'FunctionExpression' ||
            n.type === 'FunctionDeclaration'
        ) {
            // Only skip if this isn't the root body we started with
            if (n !== body) continue;
        }

        for (const child of childNodes(n)) {
            stack.push(child);
        }
    }

    return false;
}

/**
 * Returns the callback argument of a `.subscribe(...)` call (first argument),
 * or null if there is none / it is not a function.
 */
function getSubscribeCallback(node: AstNode): AstNode | null {
    const args = node.arguments;
    if (!Array.isArray(args) || args.length === 0) return null;
    const first = unwrapNode(args[0]);
    if (!first) return null;
    if (
        first.type === 'ArrowFunctionExpression' ||
        first.type === 'FunctionExpression'
    ) {
        return first;
    }
    return null;
}

/**
 * Flags `.subscribe()` callbacks that themselves contain another `.subscribe()` call.
 * Nested subscribes are a textbook RxJS antipattern — use switchMap/mergeMap/concatMap.
 */
export const rxjsNoNestedSubscribeRule = createCallExpressionRule(
    'rxjs-no-nested-subscribe',
    (node: CallExpression, context: RuleContext): RuleFailure | null => {
        const n = node as unknown as AstNode;
        if (!isSubscribeCall(n)) return null;

        const callback = getSubscribeCallback(n);
        if (!callback) return null;

        const body = unwrapNode(callback.body as AstNode | undefined);
        if (!body) return null;

        if (!containsNestedSubscribe(body)) return null;

        const start = getNodeStart(n);
        const { line, column } = context.locator.location(start);

        return {
            filePath: context.filePath,
            ruleName: 'rxjs-no-nested-subscribe',
            message: 'Avoid nesting `.subscribe()` inside another `.subscribe()`. Use `switchMap`, `mergeMap`, or `concatMap` to compose streams instead.',
            line,
            column,
            severity: 'error',
            fix: RECOMMENDATIONS['rxjs-no-nested-subscribe'],
            codeExample: CODE_EXAMPLES['rxjs-no-nested-subscribe'],
        };
    }
);
