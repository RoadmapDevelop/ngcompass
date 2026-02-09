
import { parseSync, Program, ParseResult } from 'oxc-parser';

export interface TsParserResult {
    program: Program;
    errors: any[];
}

/**
 * Parses TypeScript code using Oxc.
 */
export const parseTs = (content: string, filePath: string): TsParserResult => {
    const result: ParseResult = parseSync(filePath, content, {
        sourceType: 'module',
        lang: 'tsx' // Handle TS/TSX
    });

    return {
        program: result.program,
        errors: result.errors,
    };
};
