/**
 * @fileoverview
 * TypeScript / TSX parser wrapper around Oxc.
 *
 * Centralizes the Oxc invocation so every caller in the monorepo parses
 * with identical options (`sourceType: "module"`, `lang: "tsx"`). Returning
 * a small `{ program, errors }` shape keeps the Oxc surface contained to
 * this module — callers never see the raw `ParseResult` shape.
 */

import { parseSync, type ParseResult, type Program } from 'oxc-parser';

/** Outcome of a successful TypeScript parse. */
export interface TsParserResult {
    program: Program;
    errors: unknown[];
}

/**
 * Parses TypeScript / TSX source code using Oxc.
 *
 * @param content - Source text.
 * @param filePath - Source filename, used for parser diagnostics only.
 * @returns The parsed program and any parse errors Oxc reported.
 */
export const parseTs = (content: string, filePath: string): TsParserResult => {
    const result = runOxcParse(filePath, content);
    return { program: result.program, errors: result.errors };
};

/** Executes a synchronous Oxc parse with fixed, deterministic options. */
const runOxcParse = (filePath: string, content: string): ParseResult => {
    return parseSync(filePath, content, {
        sourceType: 'module',
        lang: 'tsx',
    });
};
