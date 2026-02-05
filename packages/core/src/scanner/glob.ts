/**
 * Glob Execution
 *
 * Isolated side effect: File system I/O
 * Uses Result type for error handling (no exceptions)
 */

import fg from 'fast-glob';
import type { ExpandedPatterns, RawFileList, Result } from './types.js';
import { Ok, Err } from './types.js';

/**
 * Executes glob to discover files matching patterns.
 *
 * Side effect: File system I/O
 * Error handling: Returns Result type (no exceptions thrown)
 *
 * @param patterns - Expanded glob patterns
 * @param rootDir - Root directory for scanning
 * @param options - Glob execution options
 * @returns Result containing file list or error
 */
export const executeGlob = async (
    patterns: ExpandedPatterns,
    rootDir: string,
    options: { readonly followSymlinks: boolean }
): Promise<Result<RawFileList>> => {
    try {
        const files = await fg([...patterns.include], {
            cwd: rootDir,
            ignore: [...patterns.ignore],
            absolute: true,
            followSymbolicLinks: options.followSymlinks,
            onlyFiles: true,
            dot: false, // Skip hidden files
            suppressErrors: true, // Don't throw on permission errors
        });

        return Ok({ files });
    } catch (error) {
        return Err(new Error(`Glob execution failed: ${(error as Error).message}`));
    }
};

/**
 * Checks if glob patterns will likely match files.
 *
 * Pure function - analyzes patterns without executing glob.
 *
 * @param patterns - Patterns to analyze
 * @returns True if patterns look reasonable
 */
export const patternsLikelyHaveMatches = (patterns: ExpandedPatterns): boolean => {
    // If include is empty, no matches
    if (patterns.include.length === 0) return false;

    // If only negations, no matches
    if (patterns.include.every(p => p.startsWith('!'))) return false;

    return true;
};
