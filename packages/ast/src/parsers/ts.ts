import { parseSync, type Program, type ParseResult } from "oxc-parser";

export interface TsParserResult {
    program: Program;
    errors: unknown[];
}

/**
 * Parses TypeScript / TSX source code using Oxc.
 *
 * @param content - Source text
 * @param filePath - Source filename (used for diagnostics)
 * @returns Parsed program and parse errors
 */
export const parseTs = (content: string, filePath: string): TsParserResult => {
    const result = runOxcParse(filePath, content);
    return { program: result.program, errors: result.errors };
};

/**
 * Executes a synchronous Oxc parse with fixed, deterministic options.
 *
 * @param filePath - Source filename
 * @param content - Source text
 * @returns Oxc ParseResult
 */
const runOxcParse = (filePath: string, content: string): ParseResult => {
    return parseSync(filePath, content, {
        sourceType: "module",
        lang: "tsx",
    });
};
