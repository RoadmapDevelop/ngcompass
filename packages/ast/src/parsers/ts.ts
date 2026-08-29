import { parseSync, type ParseResult } from 'oxc-parser';
import type { TsParserResult } from '../models/index.js';

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
