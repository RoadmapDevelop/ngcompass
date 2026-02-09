
import { transform } from 'lightningcss';

export interface CssParserResult {
    code: Buffer | Uint8Array;
    map?: Buffer | Uint8Array;
    // LightningCSS is mostly a transformer/minifier, but we can use it to validate/parse
    // For AST access, it's limited in Node.js, mostly used for transformation.
    // We'll use it to validate syntax for now.
}

/**
 * Validates/Parses CSS using LightningCSS.
 */
// Note: We use a simplified union type here instead of generic Result to avoid circular deps
export type CssResult =
    | { ok: true; code: Buffer | Uint8Array; map?: Buffer | Uint8Array | void }
    | { ok: false; error: any };

export const parseCss = (content: string, filePath: string): CssResult => {
    try {
        const res = transform({
            filename: filePath,
            code: Buffer.from(content),
            minify: false,
            sourceMap: false
        });
        return { ok: true, ...res };
    } catch (error) {
        return { ok: false, error };
    }
};
