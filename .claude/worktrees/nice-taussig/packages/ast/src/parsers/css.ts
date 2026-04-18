import { transform } from "lightningcss";

export interface CssParserResult {
    code: Buffer | Uint8Array;
    map?: Buffer | Uint8Array | void;
}

/**
 * Result type for CSS parsing and validation.
 */
export type CssResult =
    | { ok: true; code: Buffer | Uint8Array; map?: Buffer | Uint8Array | void }
    | { ok: false; error: unknown };

/**
 * Parses and validates CSS using Lightning CSS.
 *
 * @param content - CSS source text
 * @param filePath - Source filename for diagnostics
 * @returns CssResult with transformed output or an error
 */
export const parseCss = (content: string, filePath: string): CssResult => {
    try {
        const result = runLightningCssTransform(content, filePath);
        return { ok: true, ...result };
    } catch (error) {
        return { ok: false, error };
    }
};

/**
 * Executes a Lightning CSS transform pass for validation.
 *
 * @param content - CSS source text
 * @param filePath - Source filename for diagnostics
 * @returns Lightning CSS output payload
 */
const runLightningCssTransform = (content: string, filePath: string): CssParserResult => {
    const code = Buffer.from(content);

    const result = transform({
        filename: filePath,
        code,
        minify: false,
        sourceMap: false,
    });

    return { code: result.code, map: result.map };
};
