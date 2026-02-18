
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

        // 3. Interpolations in Text
        if (node.kind === 'text' && node.tokens) {
            node.tokens.forEach((token: any) => {
                // Type 8 is interpolation? based on observation
                // Let's check parts. 
                if (token.type === 8 && token.parts.length === 3) {
                    // ["{{", " expr ", "}}"]
                    const expr = token.parts[1];
                    // The sourceSpan of the token covers {{ expr }}.
                    // We need to find the offset of the expression inside.
                    // token.sourceSpan.start.offset points to '{{'.
                    const startOffset = token.sourceSpan.start.offset + token.parts[0].length;
                    parseAndAdd(expr, startOffset, expressions);
                }
            });
        }
    };

    htmlResult.rootNodes.forEach(visit);

    return { expressions, attributes };
};

const parseAndAdd = (code: string, offset: number, outcomes: TemplateExpressionNode[]) => {
    if (!code.trim()) return;

    try {
        // Parse as expression by wrapping in parentheses to support object literals {a:1} which would be block otherwise
        // However, generic expressions should parse fine. 
        // Using `parseSync` which returns a Program.
        const ret = parseSync('template.ts', code, { sourceType: 'module', lang: 'ts' });

        if (ret.program.body.length > 0) {
            const stmt = ret.program.body[0];
            // Expect ExpressionStatement provided it's an expression
            if (stmt.type === 'ExpressionStatement' && stmt.expression) {
                outcomes.push({
                    expression: stmt.expression as any, // Type cast compatible with our minimal types
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
