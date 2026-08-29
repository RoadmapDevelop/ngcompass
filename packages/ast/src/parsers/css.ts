import { transform } from 'lightningcss';
import type { CssParserResult, CssResult } from '../models/index.js';

export const parseCss = (content: string, filePath: string): CssResult => {
  try {
    const result = runLightningCssTransform(content, filePath);
    return { ok: true, ...result };
  } catch (error) {
    return { ok: false, error };
  }
};

const runLightningCssTransform = (
  content: string,
  filePath: string
): CssParserResult => {
  const code = Buffer.from(content);
  const result = transform({
    filename: filePath,
    code,
    minify: false,
    sourceMap: false,
  });
  return { code: result.code, map: result.map };
};
