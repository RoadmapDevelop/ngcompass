
export interface HtmlParserResult {
    rootNodes: readonly unknown[];
}

import type { TemplateExpressionNode, TemplateAttributeNode, TemplateBlockNode } from '../node-streams.js';
import { parseSync } from 'oxc-parser';

/**
 * Loose shape used for traversing angular-html-parser AST nodes.
 * The library does not export types, so we model only the fields we touch.
 */
type HtmlAstNode = {
    children?: readonly HtmlAstNode[];
    attrs?: ReadonlyArray<{
        name: string;
        value: string;
        valueSpan?: { start?: { offset?: number } };
        sourceSpan?: { start?: { offset?: number }; end?: { offset?: number } };
    }>;
    kind?: string;
    type?: string;
    constructor?: { name?: string };
    value?: string;
    tokens?: ReadonlyArray<{ type: number; parts?: string[]; sourceSpan: { start: { offset: number } } }>;
    name?: string;
    parameters?: ReadonlyArray<{
        expression?: string;
        sourceSpan?: { start?: { offset?: number }; end?: { offset?: number } };
    }>;
    sourceSpan?: { start?: { offset?: number }; end?: { offset?: number } };
};

// ============================================
// PUBLIC API
// ============================================

export const analyzeTemplate = (htmlResult: HtmlParserResult): {
    expressions: TemplateExpressionNode[];
    attributes: TemplateAttributeNode[];
    blocks: TemplateBlockNode[];
} => {
    const expressions: TemplateExpressionNode[] = [];
    const attributes: TemplateAttributeNode[] = [];
    const blocks: TemplateBlockNode[] = [];

    const visit = (node: HtmlAstNode | undefined | null) => {
        if (!node) return;

        if (node.children) {
            for (const child of node.children) visit(child);
        }

        visitAttributes(node, attributes, expressions);
        visitTextNode(node, expressions);
        visitBlock(node, blocks, expressions);
    };

    for (const rootNode of htmlResult.rootNodes) visit(rootNode as HtmlAstNode);

    return { expressions, attributes, blocks };
};

// ============================================
// VISITORS — one job each
// ============================================

const visitAttributes = (
    node: HtmlAstNode,
    attributes: TemplateAttributeNode[],
    expressions: TemplateExpressionNode[],
): void => {
    if (!node.attrs) return;

    for (const attr of node.attrs) {
        const name: string = attr.name;
        const value: string = attr.value;
        const attrOffset = attr.valueSpan?.start?.offset ?? 0;

        attributes.push({
            name,
            value,
            sourceSpan: {
                start: attr.sourceSpan?.start?.offset ?? 0,
                end: attr.sourceSpan?.end?.offset ?? 0,
            },
        });

        if (!value) continue;

        if (isBindingAttribute(name)) {
            parseAndAdd(value, attrOffset, expressions);
        }
    }
};

const visitTextNode = (node: HtmlAstNode, expressions: TemplateExpressionNode[]): void => {
    const isText = node.kind === 'text' || node.type === 'text' || node.constructor?.name === 'Text';
    if (!isText || !node.value) return;

    if (node.tokens) {
        extractInterpolationsFromTokens(node, expressions);
    } else {
        extractInterpolationsManually(node, expressions);
    }
};

const visitBlock = (
    node: HtmlAstNode,
    blocks: TemplateBlockNode[],
    expressions: TemplateExpressionNode[],
): void => {
    if (node.kind !== 'block' && node.constructor?.name !== 'Block') return;

    const blockName = node.name ?? '';
    const parameters = node.parameters ?? [];

    blocks.push({
        name: blockName,
        parameters: parameters.map((p) => ({
            expression: p.expression ?? '',
            sourceSpan: {
                start: p.sourceSpan?.start?.offset ?? 0,
                end: p.sourceSpan?.end?.offset ?? 0,
            },
        })),
        sourceSpan: {
            start: node.sourceSpan?.start?.offset ?? 0,
            end: node.sourceSpan?.end?.offset ?? 0,
        },
    });

    for (const param of parameters) {
        if (!param.expression) continue;
        const offset = param.sourceSpan?.start?.offset ?? 0;

        if (blockName === 'for') {
            extractForBlockExpressions(param.expression, offset, expressions);
        } else {
            parseAndAdd(param.expression, offset, expressions);
        }
    }
};

// ============================================
// INTERPOLATION EXTRACTION
// ============================================

/** Extracts {{ expr }} from angular-html-parser token list when available. */
const extractInterpolationsFromTokens = (node: HtmlAstNode, expressions: TemplateExpressionNode[]): void => {
    if (!node.tokens) return;
    for (const token of node.tokens) {
        if (token.type === 8 && token.parts?.length === 3) {
            const expr = token.parts[1];
            const startOffset = token.sourceSpan.start.offset + token.parts[0].length;
            parseAndAdd(expr, startOffset, expressions);
        }
    }
};

/** Extracts {{ expr }} via manual scan when token list is not available. */
const extractInterpolationsManually = (node: HtmlAstNode, expressions: TemplateExpressionNode[]): void => {
    const textValue = node.value ?? '';
    const nodeStart = node.sourceSpan?.start?.offset ?? 0;
    let lastIndex = 0;

    let start = textValue.indexOf('{{', lastIndex);
    while (start !== -1) {
        const end = textValue.indexOf('}}', start + 2);
        if (end === -1) break;

        parseAndAdd(
            textValue.substring(start + 2, end),
            nodeStart + start + 2,
            expressions,
        );

        lastIndex = end + 2;
        start = textValue.indexOf('{{', lastIndex);
    }
};

// ============================================
// @for MICROSYNTAX
// ============================================

/**
 * Extracts the collection and track expressions from an @for block parameter.
 * Example: "item of items; track item.id"
 */
const extractForBlockExpressions = (
    expression: string,
    offset: number,
    expressions: TemplateExpressionNode[],
): void => {
    if (expression.includes(' track ')) {
        const trackPart = expression.split(' track ')[1];
        const trackOffset = offset + expression.indexOf(' track ') + 7;
        parseAndAdd(trackPart, trackOffset, expressions);
    } else if (expression.startsWith('track ')) {
        parseAndAdd(expression.substring(6), offset + 6, expressions);
    }

    if (expression.includes(' of ')) {
        const collectionPart = expression.split(' of ')[1].split(';')[0];
        const collectionOffset = offset + expression.indexOf(' of ') + 4;
        parseAndAdd(collectionPart, collectionOffset, expressions);
    }
};

// ============================================
// HELPERS
// ============================================

/** Returns true for attribute names that contain Angular binding expressions. */
const isBindingAttribute = (name: string): boolean =>
    name.startsWith('*') ||
    (name.startsWith('[') && name.endsWith(']')) ||
    name.startsWith('bind-');

/**
 * Parses a template expression fragment and appends the result to `outcomes`.
 * Wraps the fragment in parentheses so object literals are not mistaken for blocks.
 */
const parseAndAdd = (code: string, offset: number, outcomes: TemplateExpressionNode[]): void => {
    if (!code.trim()) return;

    try {
        const ret = parseSync('template.ts', `(${code})`, { sourceType: 'module', lang: 'ts' });

        if (ret.program.body.length === 0) return;

        const stmt = ret.program.body[0];
        if (stmt.type !== 'ExpressionStatement' || !stmt.expression) return;

        let expr = stmt.expression as { type: string; expression?: unknown };
        if (expr.type === 'ParenthesizedExpression' && expr.expression) {
            expr = expr.expression as typeof expr;
        }

        outcomes.push({
            expression: expr,
            sourceSpan: { start: offset, end: offset + code.length },
        });
    } catch {
        // Ignore parse errors for expression fragments
    }
};
