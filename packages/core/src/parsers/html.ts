import { parse } from "angular-html-parser";

export interface HtmlParserResult {
    rootNodes: unknown[];
    errors: unknown[];
}

/**
 * Parses Angular HTML template source.
 *
 * @param content - Template source text
 * @returns Parsed root nodes and parse errors
 */
export const parseHtml = (content: string): HtmlParserResult => {
    const result = runAngularHtmlParse(content);
    return { rootNodes: result.rootNodes, errors: result.errors };
};

/**
 * Executes Angular HTML parsing with fixed configuration.
 *
 * @param content - Template source text
 * @returns Parser output
 */
const runAngularHtmlParse = (content: string): { rootNodes: unknown[]; errors: unknown[] } => {
    return parse(content);
};
