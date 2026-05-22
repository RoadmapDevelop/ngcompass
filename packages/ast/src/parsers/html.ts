/**
 * @fileoverview
 * Angular HTML template parser wrapper around `angular-html-parser`.
 *
 * Always enables `tokenizeAngularBlocks` so the analyzer can see `@if`,
 * `@for`, etc. as first-class block nodes. The parser surface here is the
 * single source of truth for {@link HtmlParserResult} (the same shape is
 * consumed by `template-analyzer.ts`).
 */

import { parse } from 'angular-html-parser';

/** Outcome of a successful Angular template parse. */
export interface HtmlParserResult {
    readonly rootNodes: ReadonlyArray<unknown>;
    readonly errors: ReadonlyArray<unknown>;
    /**
     * Byte offset in the *source file* where the template content begins.
     *
     * - For external `.html` files this is always `0` — the HTML file IS the
     *   template, so its offsets are already file-absolute.
     * - For inline templates inside a `.ts` file this is the position of the
     *   first content character (right after the opening quote/backtick) in
     *   the TypeScript source.
     *
     * `analyzeTemplate()` adds this value to every span it produces, so
     * callers receive file-absolute coordinates directly.
     */
    readonly templateStartOffset: number;
}

/**
 * Parses Angular HTML template source.
 *
 * @param content - Template source text (content only, no surrounding quotes).
 * @param templateStartOffset - Byte offset in the original source file where
 *   `content[0]` lives. Use `0` for external `.html` files; pass the value
 *   returned by `extractTemplateFromProgram()` for inline templates.
 * @returns The parsed root nodes, parse errors, and the start offset.
 */
export const parseHtml = (content: string, templateStartOffset = 0): HtmlParserResult => {
    const result = runAngularHtmlParse(content);
    return {
        rootNodes: result.rootNodes,
        errors: result.errors,
        templateStartOffset,
    };
};

/** Executes Angular HTML parsing with fixed configuration. */
const runAngularHtmlParse = (
    content: string,
): { rootNodes: unknown[]; errors: unknown[] } =>
    parse(content, { tokenizeAngularBlocks: true }) as {
        rootNodes: unknown[];
        errors: unknown[];
    };
