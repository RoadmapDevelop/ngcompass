
import { parse } from 'angular-html-parser';

export interface HtmlParserResult {
    rootNodes: any[];
    errors: any[];
}

/**
 * Parses Angular HTML templates.
 */
export const parseHtml = (content: string): HtmlParserResult => {
    const result = parse(content);
    return {
        rootNodes: result.rootNodes,
        errors: result.errors,
    };
};
