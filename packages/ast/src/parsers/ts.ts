import { parseSync, type ParseResult, type Program } from 'oxc-parser';

export interface TsParserResult {
  program: Program;
  errors: unknown[];
}

export const parseTs = (content: string, filePath: string): TsParserResult => {
  const result = runOxcParse(filePath, content);
  return { program: result.program, errors: result.errors };
};

const runOxcParse = (filePath: string, content: string): ParseResult => {
  return parseSync(filePath, content, {
    sourceType: 'module',
    lang: 'tsx',
  });
};
