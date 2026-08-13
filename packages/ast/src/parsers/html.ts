import { parse } from 'angular-html-parser';
import type { HtmlParserResult } from '../models/index.js';

export const parseHtml = (
  content: string,
  templateStartOffset = 0
): HtmlParserResult => {
  const result = runAngularHtmlParse(content);
  return {
    rootNodes: result.rootNodes,
    errors: result.errors,
    templateStartOffset,
  };
};

const runAngularHtmlParse = (
  content: string
): { rootNodes: unknown[]; errors: unknown[] } =>
  parse(content, { tokenizeAngularBlocks: true }) as {
    rootNodes: unknown[];
    errors: unknown[];
  };
