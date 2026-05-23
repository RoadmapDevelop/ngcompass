/**
 * @fileoverview
 * Angular template analyzer.
 *
 * Walks an `angular-html-parser` AST and harvests every expression,
 * attribute, and block that template rules can subscribe to. Expression
 * fragments are re-parsed through Oxc so the resulting `expression` is the
 * same shape rules already use elsewhere (e.g. for `.ts` files).
 *
 * Offset handling:
 *  - The HTML parser produces template-relative offsets.
 *  - The analyzer's input `templateStartOffset` is added to every offset
 *    before the result is returned, so consumers always receive
 *    file-absolute spans — no second pass required.
 */

import { parseSync } from 'oxc-parser';
import { debug } from '@ngcompass/common';
import type {
    TemplateAnalysis,
    TemplateAttributeNode,
    TemplateBlockNode,
    TemplateExpressionNode,
} from '../node-streams.js';
import type { HtmlParserResult } from '../parsers/html.js';

/**
 * Loose shape used for traversing `angular-html-parser` nodes. The library
 * does not export types, so we model only the fields we touch.
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
    tokens?: ReadonlyArray<{
        type: number;
        parts?: string[];
        sourceSpan: { start: { offset: number } };
    }>;
    name?: string;
    parameters?: ReadonlyArray<{
        expression?: string;
        sourceSpan?: { start?: { offset?: number }; end?: { offset?: number } };
    }>;
    sourceSpan?: { start?: { offset?: number }; end?: { offset?: number } };
};

// ── Parser internals (kept as named constants) ─────────────────────────────

/** `angular-html-parser` token kind for an interpolation token (`{{ … }}`). */
const TOKEN_KIND_INTERPOLATION = 8;

/** Expected number of `parts` on an interpolation token: prefix, expr, suffix. */
const INTERPOLATION_PART_COUNT = 3;

/** `'{{'` length — used to compute the offset of an interpolation expression. */
const INTERPOLATION_OPEN_LEN = 2;

/** Microsyntax keywords as they appear inside an `@for` block parameter. */
const FOR_OF = ' of ';
const FOR_TRACK = ' track ';

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Walks `htmlResult` and returns every expression, attribute, and block
 * the engine should expose to template rules.
 *
 * All offsets in the returned spans are translated into file-absolute
 * coordinates using `htmlResult.templateStartOffset` so callers never need
 * to add the offset themselves.
 *
 * @param htmlResult - Output of {@link parseHtml}.
 * @returns The aggregated {@link TemplateAnalysis}.
 */
export const analyzeTemplate = (htmlResult: HtmlParserResult): TemplateAnalysis => {
    const expressions: TemplateExpressionNode[] = [];
    const attributes: TemplateAttributeNode[] = [];
    const blocks: TemplateBlockNode[] = [];
    const offset = htmlResult.templateStartOffset;

    const visit = (node: HtmlAstNode | undefined | null): void => {
        if (!node) return;
        if (node.children) {
            for (const child of node.children) visit(child);
        }
        visitAttributes(node, attributes, expressions, offset);
        visitTextNode(node, expressions, offset);
        visitBlock(node, blocks, expressions, offset);
    };

    for (const rootNode of htmlResult.rootNodes) visit(rootNode as HtmlAstNode);

    return { expressions, attributes, blocks };
};

// ── Visitors ───────────────────────────────────────────────────────────────

const visitAttributes = (
    node: HtmlAstNode,
    attributes: TemplateAttributeNode[],
    expressions: TemplateExpressionNode[],
    offset: number,
): void => {
    if (!node.attrs) return;

    for (const attr of node.attrs) {
        const name = attr.name;
        const value = attr.value;
        const attrOffset = (attr.valueSpan?.start?.offset ?? 0) + offset;

        attributes.push({
            name,
            value,
            sourceSpan: {
                start: (attr.sourceSpan?.start?.offset ?? 0) + offset,
                end: (attr.sourceSpan?.end?.offset ?? 0) + offset,
            },
        });

        if (!value) continue;
        if (isBindingAttribute(name)) {
            parseAndAdd(value, attrOffset, expressions);
        }
    }
};

const visitTextNode = (
    node: HtmlAstNode,
    expressions: TemplateExpressionNode[],
    offset: number,
): void => {
    const isText =
        node.kind === 'text' || node.type === 'text' || node.constructor?.name === 'Text';
    if (!isText || !node.value) return;

    if (node.tokens) {
        extractInterpolationsFromTokens(node, expressions, offset);
    } else {
        extractInterpolationsManually(node, expressions, offset);
    }
};

const visitBlock = (
    node: HtmlAstNode,
    blocks: TemplateBlockNode[],
    expressions: TemplateExpressionNode[],
    offset: number,
): void => {
    if (node.kind !== 'block' && node.constructor?.name !== 'Block') return;

    const blockName = node.name ?? '';
    const parameters = node.parameters ?? [];

    blocks.push({
        name: blockName,
        parameters: parameters.map((p) => ({
            expression: p.expression ?? '',
            sourceSpan: {
                start: (p.sourceSpan?.start?.offset ?? 0) + offset,
                end: (p.sourceSpan?.end?.offset ?? 0) + offset,
            },
        })),
        sourceSpan: {
            start: (node.sourceSpan?.start?.offset ?? 0) + offset,
            end: (node.sourceSpan?.end?.offset ?? 0) + offset,
        },
    });

    for (const param of parameters) {
        if (!param.expression) continue;
        const paramOffset = (param.sourceSpan?.start?.offset ?? 0) + offset;
        if (blockName === 'for') {
            extractForBlockExpressions(param.expression, paramOffset, expressions);
        } else {
            parseAndAdd(param.expression, paramOffset, expressions);
        }
    }
};

// ── Interpolation extraction ───────────────────────────────────────────────

/** Extracts `{{ expr }}` from the parser's token list when available. */
const extractInterpolationsFromTokens = (
    node: HtmlAstNode,
    expressions: TemplateExpressionNode[],
    offset: number,
): void => {
    if (!node.tokens) return;
    for (const token of node.tokens) {
        if (token.type !== TOKEN_KIND_INTERPOLATION) continue;
        if (token.parts?.length !== INTERPOLATION_PART_COUNT) continue;

        const expr = token.parts[1];
        const exprStart = token.sourceSpan.start.offset + token.parts[0].length + offset;
        parseAndAdd(expr, exprStart, expressions);
    }
};

/** Extracts `{{ expr }}` via manual scan when the token list is unavailable. */
const extractInterpolationsManually = (
    node: HtmlAstNode,
    expressions: TemplateExpressionNode[],
    offset: number,
): void => {
    const textValue = node.value ?? '';
    const nodeStart = (node.sourceSpan?.start?.offset ?? 0) + offset;

    let cursor = 0;
    let start = textValue.indexOf('{{', cursor);
    while (start !== -1) {
        const end = textValue.indexOf('}}', start + INTERPOLATION_OPEN_LEN);
        if (end === -1) break;
        parseAndAdd(
            textValue.substring(start + INTERPOLATION_OPEN_LEN, end),
            nodeStart + start + INTERPOLATION_OPEN_LEN,
            expressions,
        );
        cursor = end + INTERPOLATION_OPEN_LEN;
        start = textValue.indexOf('{{', cursor);
    }
};

// ── @for microsyntax ───────────────────────────────────────────────────────

/**
 * Extracts the collection and track expressions from an `@for` block
 * parameter (e.g. `"item of items; track item.id"`).
 *
 * Known limitation: this is a string-level split — `track` or `of` appearing
 * inside a quoted string within the parameter would confuse it. Real-world
 * `@for` parameters never include such literals, so the simpler parser is
 * preferred over a full tokenizer.
 */
const extractForBlockExpressions = (
    expression: string,
    offset: number,
    expressions: TemplateExpressionNode[],
): void => {
    if (expression.includes(FOR_TRACK)) {
        const trackPart = expression.split(FOR_TRACK)[1];
        const trackOffset = offset + expression.indexOf(FOR_TRACK) + FOR_TRACK.length;
        parseAndAdd(trackPart, trackOffset, expressions);
    } else if (expression.startsWith('track ')) {
        parseAndAdd(expression.substring(6), offset + 6, expressions);
    }

    if (expression.includes(FOR_OF)) {
        const collectionPart = expression.split(FOR_OF)[1].split(';')[0];
        const collectionOffset = offset + expression.indexOf(FOR_OF) + FOR_OF.length;
        parseAndAdd(collectionPart, collectionOffset, expressions);
    }
};

// ── Helpers ────────────────────────────────────────────────────────────────

/** Returns `true` for attribute names that contain Angular binding expressions. */
const isBindingAttribute = (name: string): boolean =>
    name.startsWith('*')
    || (name.startsWith('[') && name.endsWith(']'))
    || name.startsWith('bind-');

/**
 * Parses a template expression fragment with Oxc and appends a stream node.
 * Wraps the fragment in parentheses so object-literal expressions are not
 * misinterpreted as block statements.
 */
const parseAndAdd = (
    code: string,
    offset: number,
    outcomes: TemplateExpressionNode[],
): void => {
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
    } catch (err) {
        // Expression fragments that fail to parse are intentionally dropped —
        // template rules can still inspect the surrounding attribute or block.
        // Log at debug level so the underlying error is visible without
        // surfacing it as a tool-level failure.
        const message = err instanceof Error ? err.message : String(err);
        debug('parser', `Skipping unparsable template fragment "${code}": ${message}`);
    }
};
