/**
 * @fileoverview
 * Glob-based file discovery.
 *
 * Thin wrapper around `tinyglobby` that produces a {@link Result} so the
 * scanner pipeline can keep error handling uniform. Used both as the
 * non-Git default and as the fallback when `git ls-files` returns nothing.
 */

import { glob } from 'tinyglobby';
import { Err, Ok, type ExpandedPatterns, type RawFileList, type Result } from './types.js';

/**
 * Runs a glob over `rootDir` using `patterns.include` / `patterns.ignore`.
 *
 * @param patterns - Expanded include/ignore globs.
 * @param rootDir  - Search root.
 * @param options  - Toggles for symlink following and dotfile matching.
 */
export const executeGlob = async (
    patterns: ExpandedPatterns,
    rootDir: string,
    options: { readonly followSymlinks: boolean; readonly dot: boolean },
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
 * Returns `true` when the supplied include patterns can plausibly match at
 * least one file. Useful as a fast guard before invoking the glob engine.
 */
export const patternsLikelyHaveMatches = (patterns: ExpandedPatterns): boolean => {
    if (patterns.include.length === 0) return false;
    if (patterns.include.every((p) => p.startsWith('!'))) return false;
    return true;
};
