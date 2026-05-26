import { parse } from 'angular-html-parser';

export interface HtmlParserResult {
  readonly rootNodes: ReadonlyArray<unknown>;
  readonly errors: ReadonlyArray<unknown>;

  readonly templateStartOffset: number;
}

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
