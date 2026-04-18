/**
 * @fileoverview
 * Facilitates asynchronous file discovery using glob pattern evaluation.
 *
 * Implements a result-oriented execution wrapper around the underlying glob
 * engine, ensuring consistent error handling and absolute path resolution.
 */

import { glob } from 'tinyglobby';
import type { ExpandedPatterns, RawFileList, Result } from './types.js';
import { Ok, Err } from './types.js';

/**
 * Executes a glob operation to discover files satisfying the specified patterns.
 *
 * @param patterns - A collection of inclusion and exclusion glob patterns.
 * @param rootDir - The base directory for the scan operation.
 * @param options - Configuration parameters for glob execution.
 * @returns A promise resolving to a Result containing the discovered file paths.
 */
export const executeGlob = async (
    patterns: ExpandedPatterns,
    rootDir: string,
    options: { readonly followSymlinks: boolean; readonly dot: boolean }
): Promise<Result<RawFileList>> => {
    try {
        const files = await glob([...patterns.include], {
            cwd: rootDir,
            ignore: [...patterns.ignore],
            absolute: true,
            followSymbolicLinks: options.followSymlinks,
            onlyFiles: true,
            dot: options.dot,
        });

        return Ok({ files });
    } catch (error) {
        return Err(new Error(`Glob execution failed: ${(error as Error).message}`));
    }
};

/**
 * Determines if a collection of glob patterns is likely to produce matches.
 *
 * Performs a static analysis of the provided patterns to identify configurations
 * that are inherently empty or exclusively exclusionary.
 *
 * @param patterns - The pattern collection to analyze.
 * @returns True if the patterns are structurally valid for matching.
 */
export const patternsLikelyHaveMatches = (patterns: ExpandedPatterns): boolean => {
    if (patterns.include.length === 0) return false;
    if (patterns.include.every(p => p.startsWith('!'))) return false;

    return true;
};
