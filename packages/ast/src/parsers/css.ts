import { transform } from 'lightningcss';

export interface CssParserResult {
  code: Buffer | Uint8Array;
  map?: Buffer | Uint8Array | void;
}

export type CssResult =
  | { ok: true; code: Buffer | Uint8Array; map?: Buffer | Uint8Array | void }
  | { ok: false; error: unknown };

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
