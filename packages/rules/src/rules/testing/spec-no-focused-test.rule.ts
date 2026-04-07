import { RuleFailure, RuleContext } from "@ngcompass/common";
import { CallExpression } from "@ngcompass/ast";
import { createCallExpressionRule } from '@ngcompass/engine';
import { RECOMMENDATIONS } from "../../recommendations";
import { AstNode, unwrapNode, getNodeStart } from "../../rule-utils";

const FOCUSED_MAP: Record<string, string> = {
    'fdescribe': 'describe',
    'fit': 'it',
    'describe.only': 'describe',
    'it.only': 'it',
    'test.only': 'test',
    'context.only': 'context',
    'xdescribe': 'describe',
    'xit': 'it',
    'xtest': 'test',
    'xcontext': 'context',
};

const FOCUSED_NAMES = new Set(Object.keys(FOCUSED_MAP));
const SKIPPED_NAMES = new Set(['xdescribe', 'xit', 'xtest', 'xcontext']);

function getIdentifierName(node: AstNode): string | null {
    if (node.type === 'Identifier') {
        return (node.name as string) ?? null;
    }
    return null;
}

function getMemberExpressionName(node: AstNode): string | null {
    if (
        node.type === 'MemberExpression' ||
        node.type === 'StaticMemberExpression' ||
        node.type === 'OptionalMemberExpression'
    ) {
        const obj = unwrapNode(node.object as AstNode);
        const prop = (node.property as AstNode)?.name as string ?? '';
        const objName = (obj?.type === 'Identifier' ? obj.name : '') as string ?? '';
        
        return objName ? `${objName}.${prop}` : null;
    }
    return null;
}

function getFocusedName(callee: AstNode): string | null {
    const name = getIdentifierName(callee) || getMemberExpressionName(callee);
    return (name && FOCUSED_NAMES.has(name)) ? name : null;
}

function isSpecFile(filePath: string): boolean {
    return filePath.endsWith('.spec.ts') || filePath.endsWith('.test.ts');
}

export const specNoFocusedTestRule = createCallExpressionRule(
    'spec-no-focused-test',
    (node: CallExpression, context: RuleContext): RuleFailure | null => {
        if (!isSpecFile(context.filePath)) {
            return null;
        }

        const callee = unwrapNode(node.callee as AstNode);
        if (!callee) {
            return null;
        }

        const focusedName = getFocusedName(callee);

        // Detect pending() calls
        if (!focusedName) {
            const name = getIdentifierName(callee);
            if (name === 'pending') {
                const start = getNodeStart(node as unknown as AstNode);
                const { line, column } = context.locator.location(start);
                return {
                    filePath: context.filePath,
                    ruleName: 'spec-no-focused-test',
                    message: '`pending()` marks the enclosing test as pending. Remove it before committing.',
                    line,
                    column,
                    severity: 'error',
                    fix: RECOMMENDATIONS['spec-no-focused-test'],
                };
            }
            return null;
        }

        const replacement = FOCUSED_MAP[focusedName];
        const start = getNodeStart(node as unknown as AstNode);
        const { line, column } = context.locator.location(start);

        const message = SKIPPED_NAMES.has(focusedName)
            ? `\`${focusedName}\` disables a test that may be forgotten. Re-enable with \`${replacement}\` or remove the test entirely.`
            : `\`${focusedName}\` is a focused test helper that silently skips all other tests in CI. Replace with \`${replacement}\`.`;

        return {
            filePath: context.filePath,
            ruleName: 'spec-no-focused-test',
            message,
            line,
            column,
            severity: 'error',
            fix: RECOMMENDATIONS['spec-no-focused-test'],
        };
    }
);
