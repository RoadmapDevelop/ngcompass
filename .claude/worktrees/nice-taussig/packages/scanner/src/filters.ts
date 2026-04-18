/**
 * @fileoverview
 * Provides high-performance file filtering utilities for the scanner.
 *
 * Implements functional primitives for deduplication, gitignore evaluation,
 * extension filtering, and glob-based inclusion/exclusion logic. All operations
 * prioritize immutability and predictable outcomes.
 */

import path from 'node:path';
import { minimatch } from 'minimatch';
import type {
    RawFileList,
    FilteredFileList,
    NormalizedOptions,
    GitignoreFilter,
    Result
} from './types.js';
import { Ok, Err } from './types.js';
import { loadAllGitignoreFilters } from './gitignore.js';

/**
 * Deduplicates a collection of file paths.
 *
 * @param files - A collection of file paths, potentially containing duplicates.
 * @returns A new read-only collection with duplicate entries removed.
 */
export const deduplicateFiles = (
    files: ReadonlyArray<string>
): ReadonlyArray<string> =>
    Array.from(new Set(files));

/**
 * Evaluates a collection of file paths against a gitignore filter.
 *
 * @param files - The file paths to evaluate.
 * @param rootDir - The project root directory for relative path resolution.
 * @param filter - The gitignore evaluator function.
 * @returns A filtered collection of file paths.
 */
export const applyGitignoreFilter = (
    files: ReadonlyArray<string>,
    rootDir: string,
    filter: GitignoreFilter
): ReadonlyArray<string> =>
    files.filter(file => filter(file, rootDir));

/**
 * Orchestrates the application of configured filters to a raw file collection.
 *
 * Aggregates multiple filtering stages, including gitignore evaluation and
 * deduplication, returning a consolidated result set.
 *
 * @param rawFiles - The initial collection of file paths discovered by the scanner.
 * @param options - The normalized configuration options for the scan operation.
 * @returns A promise resolving to the filtered results or an operational error.
 */
export const applyFilters = async (
    rawFiles: RawFileList,
    options: NormalizedOptions
): Promise<Result<FilteredFileList>> => {
    try {
        let files = rawFiles.files;
        const startCount = files.length;

        if (options.respectGitignore) {
            const filterResult = await loadAllGitignoreFilters(options.rootDir, files);

            if (!filterResult.ok) {
                return filterResult;
            }

            files = applyGitignoreFilter(files, options.rootDir, filterResult.data);
        }

        files = deduplicateFiles(files);

        return Ok({
            files,
            filtered: startCount - files.length
        });
    } catch (error) {
        return Err(new Error(`Filtering failed: ${(error as Error).message}`));
    }
};

/**
 * Filters a collection of files based on their file extensions.
 *
 * @param files - The files to evaluate.
 * @param extensions - A collection of allowed file extensions (e.g., ['.ts', '.html']).
 * @returns A collection of files matching the specified extensions.
 */
export const filterByExtension = (
    files: ReadonlyArray<string>,
    extensions: ReadonlyArray<string>
): ReadonlyArray<string> => {
    const extSet = new Set(extensions);
    return files.filter(file => {
        const ext = file.substring(file.lastIndexOf('.'));
        return extSet.has(ext);
    });
};

/**
 * Filters a collection of files using regular expression pattern matching.
 *
 * @param files - The files to evaluate.
 * @param pattern - The regular expression pattern to apply.
 * @returns A collection of files that satisfy the pattern.
 */
export const filterByPattern = (
    files: ReadonlyArray<string>,
    pattern: RegExp
): ReadonlyArray<string> =>
    files.filter(file => pattern.test(file));

/**
 * Filters a collection of files using glob pattern matching.
 *
 * @param files - The files to evaluate.
 * @param includes - A collection of inclusion glob patterns.
 * @param ignores - A collection of exclusion glob patterns.
 * @param rootDir - The root directory for relative path matching.
 * @returns A filtered collection of file paths.
 */
export const filterByGlob = (
    files: ReadonlyArray<string>,
    includes: ReadonlyArray<string>,
    ignores: ReadonlyArray<string>,
    rootDir: string
): ReadonlyArray<string> => {
    return files.filter((file) => {
        const relativePath = path.relative(rootDir, file).replace(/\\/g, '/');

        const isIncluded = includes.some((p) => minimatch(relativePath, p, { dot: true }));
        if (!isIncluded) return false;

        const isIgnored = ignores.some((p) => minimatch(relativePath, p, { dot: true }));
        if (isIgnored) return false;

        return true;
    });
};
