import { RuleFailure } from "@ngcompass/common";
import { CallExpression } from "@ngcompass/ast";
import { createCallExpressionRule } from '@ngcompass/engine';
import { RECOMMENDATIONS } from "../../recommendations";
import { AstNode, unwrapNode, getNodeStart } from "../../rule-utils";
import { RuleContext } from "@ngcompass/common";

/**
 * Focused test functions that cause test runners to only execute the
 * focused subset, silently skipping all other tests.
 */
const FOCUSED_FUNCTIONS = new Set([
    'fdescribe',
    'fit',
    'describe.only',
    'it.only',
    'test.only',
    'context.only',
]);

function isFocusedCall(node: AstNode): string | null {
    const callee = unwrapNode(node.callee);
    if (!callee) return null;

    // Direct: fdescribe(...), fit(...)
    if (callee.type === 'Identifier') {
        const name = callee.name as string ?? '';
        if (FOCUSED_FUNCTIONS.has(name)) return name;
        return null;
    }

    // Member: describe.only(...), it.only(...), test.only(...)
    if (
        callee.type === 'MemberExpression' ||
        callee.type === 'StaticMemberExpression' ||
        callee.type === 'OptionalMemberExpression'
    ) {
        const prop = (callee.property as AstNode)?.name as string ?? '';
        const obj = (callee.object as AstNode);
        const objName = (obj?.type === 'Identifier' ? obj.name : '') as string ?? '';
        const full = `${objName}.${prop}`;
        if (FOCUSED_FUNCTIONS.has(full)) return full;
    }

    return null;
}

/**
 * Flags focused test helpers (fdescribe, fit, describe.only, it.only) in spec files.
 * Focused tests cause CI to silently pass while only running a subset of the test suite.
 */
export const specNoFocusedTestRule = createCallExpressionRule(
    'spec-no-focused-test',
    (node: CallExpression, context: RuleContext): RuleFailure | null => {
        // Only run on spec / test files
        const fp = context.filePath;
        if (!fp.endsWith('.spec.ts') && !fp.endsWith('.test.ts')) return null;

        const n = node as unknown as AstNode;
        const focusedName = isFocusedCall(n);
        if (!focusedName) return null;

        const start = getNodeStart(n);
        const { line, column } = context.locator.location(start);

        return {
            filePath: context.filePath,
            ruleName: 'spec-no-focused-test',
            message: `\`${focusedName}\` is a focused test helper that silently skips all other tests in CI. Replace with \`${focusedName.replace(/^f|\.only$/, '')}\`.`,
            line,
            column,
            severity: 'error',
            fix: RECOMMENDATIONS['spec-no-focused-test'],
        };
    }
);
