/**
 * @fileoverview
 * CSS parser / validator wrapper around Lightning CSS.
 *
 * Lightning CSS performs a full transform pass even when `minify: false`,
 * which doubles as syntactic validation — any malformed declaration throws.
 * The wrapper returns a discriminated `CssResult` so callers can branch on
 * `ok` instead of catching exceptions themselves.
 *
 * Note: `Buffer.from(content)` allocates a fresh buffer per call. This is
 * acceptable in the current pipeline (CSS files are read individually) but
 * worth re-evaluating if a bulk CSS pass becomes a hot path.
 */

import { transform } from 'lightningcss';

/** Lightning CSS transform output payload. */
export interface CssParserResult {
    code: Buffer | Uint8Array;
    map?: Buffer | Uint8Array | void;
}

/** Discriminated outcome of {@link parseCss}. */
export type CssResult =
    | { ok: true; code: Buffer | Uint8Array; map?: Buffer | Uint8Array | void }
    | { ok: false; error: unknown };

/**
 * Parses and validates CSS using Lightning CSS.
 *
 * @param content - CSS source text.
 * @param filePath - Source filename used for diagnostics only.
 * @returns Either a transformed payload (`ok: true`) or the captured error.
 */
export const parseCss = (content: string, filePath: string): CssResult => {
    try {
        const result = runLightningCssTransform(content, filePath);
        return { ok: true, ...result };
    } catch (error) {
        return { ok: false, error };
    }
};

/** Executes a Lightning CSS transform pass for validation. */
const runLightningCssTransform = (
    content: string,
    filePath: string,
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
