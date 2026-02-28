
export interface HtmlParserResult {
    rootNodes: any[];
}
import type { TemplateExpressionNode, TemplateAttributeNode } from '../node-streams.js';
import { parseSync } from 'oxc-parser';

/**
 * Traverses HTML AST and extracts Angular expressions.
 */
export const analyzeTemplate = (htmlResult: HtmlParserResult): {
    expressions: TemplateExpressionNode[];
    attributes: TemplateAttributeNode[];
} => {
    const expressions: TemplateExpressionNode[] = [];
    const attributes: TemplateAttributeNode[] = [];

    const visit = (node: any) => {
        if (!node) return;

        // Recurse into children first (generated AST from angular-html-parser).
        // for-of replaces forEach to avoid allocating a closure on every call.
        if (node.children) {
            for (const child of node.children) visit(child);
        }

        // 1. Attributes (Inputs, Structural Directives)
        if (node.attrs) {
            for (const attr of node.attrs) {
                const name: string = attr.name;
                const value: string = attr.value;
                const attrOffset = attr.valueSpan?.start?.offset ?? 0;

                // Always register to the attributes stream
                attributes.push({
                    name,
                    value,
                    sourceSpan: {
                        start: attr.sourceSpan?.start?.offset ?? 0,
                        end: attr.sourceSpan?.end?.offset ?? 0,
                    },
                });

                if (!value) continue;

                // *ngIf="expr"  — structural directives use microsyntax
                if (name.startsWith('*')) {
                    parseAndAdd(value, attrOffset, expressions);
                    // [prop]="expr" — property binding
                } else if (name.startsWith('[') && name.endsWith(']')) {
                    parseAndAdd(value, attrOffset, expressions);
                    // bind-prop="expr" — long-form property binding
                } else if (name.startsWith('bind-')) {
                    parseAndAdd(value, attrOffset, expressions);
                }
            }
        }

        // 2. Text and Interpolations
        const isText = node.kind === 'text' || node.type === 'text' || node.constructor?.name === 'Text';
        if (isText && node.value) {
            // Use tokens when available (some angular-html-parser versions provide them)
            if (node.tokens) {
                for (const token of node.tokens) {
                    if (token.type === 8 && token.parts?.length === 3) {
                        const expr = token.parts[1];
                        const startOffset = token.sourceSpan.start.offset + token.parts[0].length;
                        parseAndAdd(expr, startOffset, expressions);
                    }
                }
            } else {
                // Manual interpolation extraction: scan for {{ ... }} pairs
                const textValue = node.value as string;
                const nodeStart = node.sourceSpan?.start?.offset ?? 0;
                let lastIndex = 0;

                while (true) {
                    const start = textValue.indexOf('{{', lastIndex);
                    if (start === -1) break;
                    const end = textValue.indexOf('}}', start + 2);
                    if (end === -1) break;

                    parseAndAdd(
                        textValue.substring(start + 2, end),
                        nodeStart + start + 2,
                        expressions
                    );

                    lastIndex = end + 2;
                }
            }
        }
    };

    for (const rootNode of htmlResult.rootNodes) visit(rootNode);

    return { expressions, attributes };
};

const parseAndAdd = (code: string, offset: number, outcomes: TemplateExpressionNode[]) => {
    if (!code.trim()) return;

    try {
        // Wrap in parentheses so that object literals like { color: 'red' } are parsed as
        // ObjectExpression (inside an ExpressionStatement) rather than as a BlockStatement.
        // This is safe for all Angular template expressions — identifiers, calls, ternaries,
        // binary pipes (a | b), etc. all remain valid when wrapped.
        const wrappedCode = `(${code})`;
        const ret = parseSync('template.ts', wrappedCode, { sourceType: 'module', lang: 'ts' });

        if (ret.program.body.length > 0) {
            const stmt = ret.program.body[0];
            // Expect ExpressionStatement provided it's an expression
            if (stmt.type === 'ExpressionStatement' && stmt.expression) {
                // Unwrap the ParenthesizedExpression node that oxc-parser creates when
                // the source text is wrapped in `(...)`.  Without unwrapping, rules that
                // test for e.g. ObjectExpression / ArrayExpression / BinaryExpression
                // would see a ParenthesizedExpression root and miss the match.
                let expr: any = stmt.expression;
                if (expr.type === 'ParenthesizedExpression' && expr.expression) {
                    expr = expr.expression;
                }
                outcomes.push({
                    expression: expr,
                    sourceSpan: {
                        start: offset,
                        end: offset + code.length
                    }
                });
            }
        }
    } catch (e) {
        // Ignore parse errors for fragments
    }
};
