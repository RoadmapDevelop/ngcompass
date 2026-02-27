import { createTemplateExpressionRule } from '../engine/rule-handler.js';
import type { TemplateExpressionNode } from '../engine/node-streams.js';
import type { RuleContext, RuleFailure } from '../types.js';
import { RECOMMENDATIONS } from '../recommendations.js';
import {
    type AstNode,
    unwrapNode,
    getStaticPropertyName,
    isMemberExpressionLike,
    childNodes,
} from '../rule-utils.js';

// Known-safe call names that are pipe-like or framework utilities
const ALLOWED_CALL_NAMES = new Set([
    'translate', '$localize', 'slice', 'toString', 'toFixed',
    'toUpperCase', 'toLowerCase', 'trim', 'join', 'includes',
    'indexOf', 'startsWith', 'endsWith', 'charAt', 'substring',
    'replace', 'split', 'concat', 'keys', 'values', 'entries',
    'stringify', 'parse', 'toISOString', 'toLocaleDateString',
    'toLocaleTimeString', 'toLocaleString',
]);

function getTemplateAbsoluteOffset(context: RuleContext, node: TemplateExpressionNode): number {
    const templateStartOffset = (context as any).template?.templateStartOffset;
    if (typeof templateStartOffset === 'number' && Number.isFinite(templateStartOffset)) {
        return node.sourceSpan.start + templateStartOffset;
    }
    return node.sourceSpan.start;
}

function isCallExpressionLike(node: AstNode | null | undefined): boolean {
    const n = unwrapNode(node);
    if (!n) return false;
    return n.type === 'CallExpression' || n.type === 'OptionalCallExpression';
}

function getCallArguments(node: AstNode | null | undefined): AstNode[] {
    const n = unwrapNode(node);
    const args = n?.arguments;
    return Array.isArray(args) ? args : [];
}

function getCallName(node: AstNode | null | undefined): string {
    const n = unwrapNode(node);
    if (!n) return '';
    const callee = unwrapNode(n.callee);
    if (!callee) return '';

    if (callee.type === 'Identifier') return (callee.name as string) ?? '';
    if (isMemberExpressionLike(callee)) return getStaticPropertyName(callee);
    return '';
}

function findAllFlaggedCallExpressions(root: AstNode | null | undefined): AstNode[] {
    const stack: AstNode[] = root ? [root] : [];
    const hits: AstNode[] = [];

    while (stack.length) {
        const node = stack.pop()!;
        const n = unwrapNode(node);
        if (!n) continue;

        if (isCallExpressionLike(n)) {
            const args = getCallArguments(n);
            if (args.length > 0) {
                // Check if this call is in the allowlist
                const name = getCallName(n);
                if (!name || !ALLOWED_CALL_NAMES.has(name)) {
                    hits.push(n);
                }
            }
        }

        for (const child of childNodes(n)) {
            stack.push(child);
        }
    }

    return hits;
}

/**
 * Disallows function calls with arguments inside Angular template bindings.
 * Improved: Known-safe methods (string operations, pipe-like calls) are allowed.
 */
export const templateNoCallExpressionRule = createTemplateExpressionRule(
    'template-no-call-expression',
    (node: TemplateExpressionNode, context: RuleContext): RuleFailure[] | null => {
        const hits = findAllFlaggedCallExpressions((node as any).expression);
        if (hits.length === 0) return null;

        return hits.map(() => {
            // NOTE: We could try to map the exact offset inside the expression, 
            // but for template diagnostics reporting at the start of the binding is acceptable.
            const offset = getTemplateAbsoluteOffset(context, node);
            const { line, column } = context.locator.location(offset);

            return {
                filePath: context.filePath,
                ruleName: 'template-no-call-expression',
                message: 'Avoid passing arguments to functions in templates. Use Signals or Pipes instead.',
                line,
                column,
                severity: 'high',
                fix: RECOMMENDATIONS['template-no-call-expression'],
            };
        });
    },
    {
        requires: { htmlAst: true },
    }
);
