import { parse } from "angular-html-parser";

export interface HtmlParserResult {
    rootNodes: unknown[];
    errors: unknown[];
    /**
     * Byte offset in the *source file* where the template content begins.
     *
     * - For external `.html` files this is always `0` — the HTML file is the
     *   template, so its offsets are already file-absolute.
     * - For inline templates inside a `.ts` file this is the position of the
     *   first content character (right after the opening quote/backtick) in
     *   the TypeScript source.
     *
     * Template rules MUST add this value to `node.sourceSpan.start` before
     * calling `context.locator.location()` so that reported line/column
     * numbers are correct for both inline and external templates.
     */
    templateStartOffset: number;
}

/**
 * Parses Angular HTML template source.
 *
 * @param content             - Template source text (content only, no surrounding quotes)
 * @param templateStartOffset - Byte offset in the original source file where
 *                              `content[0]` lives. Use `0` for external `.html`
 *                              files; supply the value from `extractTemplateFromProgram`
 *                              for inline templates in `.ts` files.
 * @returns Parsed root nodes, parse errors, and the start offset.
 */
export const parseHtml = (content: string, templateStartOffset = 0): HtmlParserResult => {
    const result = runAngularHtmlParse(content);
    return { rootNodes: result.rootNodes, errors: result.errors, templateStartOffset };
};

/**
 * Executes Angular HTML parsing with fixed configuration.
 *
 * @param content - Template source text
 * @returns Parser output
 */
const runAngularHtmlParse = (content: string): { rootNodes: any[]; errors: any[] } => {
    return parse(content, { tokenizeAngularBlocks: true }) as any;
};
