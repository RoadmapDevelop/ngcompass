
import type { HtmlParserResult } from '../../parsers/html.js';
import type { TemplateExpressionNode, TemplateAttributeNode } from '../engine/node-streams.js';
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

        // generated AST from angular-html-parser
        if (node.children) {
            node.children.forEach(visit);
        }

        // 1. Attributes (Inputs, Structural Directives)
        if (node.attrs) {
            node.attrs.forEach((attr: any) => {
                const name = attr.name;
                const value = attr.value;

                // Always add to attributes stream
                attributes.push({
                    name,
                    value,
                    sourceSpan: {
                        start: attr.sourceSpan?.start?.offset ?? 0,
                        end: attr.sourceSpan?.end?.offset ?? 0
                    }
                });

                if (!value) return;

                // *ngIf="expr"
                if (name.startsWith('*')) {
                    // Check for micorsyntax? parsing strictly the value for now
                    parseAndAdd(value, attr.valueSpan?.start?.offset ?? 0, expressions);
                }
                // [prop]="expr"
                else if (name.startsWith('[') && name.endsWith(']')) {
                    parseAndAdd(value, attr.valueSpan?.start?.offset ?? 0, expressions);
                }
                // bind-prop="expr"
                else if (name.startsWith('bind-')) {
                    parseAndAdd(value, attr.valueSpan?.start?.offset ?? 0, expressions);
                }
            });
        }

        // 2. inputs/outputs logic might be needed if the parser segregates them, 
        // but typically they appear as attributes in the raw parser unless processed.
        // In angular-html-parser, they are in 'attrs'.

        // 3. Text and Interpolations
        const isText = node.kind === 'text' || node.type === 'text' || node.constructor?.name === 'Text';
        if (isText && node.value) {
            // If tokens are available (some parser versions), use them
            if (node.tokens) {
                node.tokens.forEach((token: any) => {
                    if (token.type === 8 && token.parts?.length === 3) {
                        const expr = token.parts[1];
                        const startOffset = token.sourceSpan.start.offset + token.parts[0].length;
                        parseAndAdd(expr, startOffset, expressions);
                    }
                });
            } else {
                // Manual interpolation extraction for standard Text nodes
                const value = node.value as string;
                let lastIndex = 0;
                while (true) {
                    const start = value.indexOf('{{', lastIndex);
                    if (start === -1) break;
                    const end = value.indexOf('}}', start + 2);
                    if (end === -1) break;

                    const expr = value.substring(start + 2, end);
                    // sourceSpan.start.offset is the absolute start of this text node in the template
                    const nodeStart = node.sourceSpan?.start?.offset ?? 0;
                    parseAndAdd(expr, nodeStart + start + 2, expressions);

                    lastIndex = end + 2;
                }
            }
        }
    };

    htmlResult.rootNodes.forEach(visit);

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
