/**
 * File Filtering
 *
 * Pure functions for filtering file lists.
 * Uses functional composition and immutability.
 */

import type {
    RawFileList,
    FilteredFileList,
    NormalizedOptions,
    GitignoreFilter,
    Result
} from './types.js';
import { Ok, Err } from './types.js';
import { loadAndCreateGitignoreFilter } from './gitignore.js';

/**
 * Deduplicates file paths.
 *
 * Pure function:
 * - No mutations
 * - Deterministic
 * - Returns new array
 *
 * @param files - Array of file paths (may contain duplicates)
 * @returns Array with duplicates removed
 */
export const deduplicateFiles = (
    files: ReadonlyArray<string>
): ReadonlyArray<string> =>
    Array.from(new Set(files));

/**
 * Applies a gitignore filter to a file list.
 *
 * Pure function (assuming filter function is pure).
 *
 * @param files - Files to filter
 * @param rootDir - Root directory for relative path calculation
 * @param filter - Gitignore filter function
 * @returns Filtered file list
 */
export const applyGitignoreFilter = (
    files: ReadonlyArray<string>,
    rootDir: string,
    filter: GitignoreFilter
): ReadonlyArray<string> =>
    files.filter(file => filter(file, rootDir));

/**
 * Applies all filters to a file list.
 *
 * Composes multiple filtering operations:
 * 1. Apply gitignore (if enabled)
 * 2. Deduplicate
 *
 * @param rawFiles - Raw file list from glob
 * @param options - Normalized scanner options
 * @returns Result containing filtered files or error
 */
export const applyFilters = async (
    rawFiles: RawFileList,
    options: NormalizedOptions
): Promise<Result<FilteredFileList>> => {
    try {
        let files = rawFiles.files;
        const startCount = files.length;

        // Apply gitignore if enabled
        if (options.respectGitignore) {
            const filterResult = await loadAndCreateGitignoreFilter(options.rootDir);

            if (!filterResult.ok) {
                return filterResult;
            }

            files = applyGitignoreFilter(files, options.rootDir, filterResult.data);
        }

        // Deduplicate (pure operation)
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
 * Filters files by extension.
 *
 * Pure function - returns new array.
 *
 * @param files - Files to filter
 * @param extensions - Allowed extensions (e.g., ['.ts', '.html'])
 * @returns Files matching the extensions
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
 * Filters files by pattern matching.
 *
 * Pure function - uses regex for pattern matching.
 *
 * @param files - Files to filter
 * @param pattern - Regex pattern to match
 * @returns Files matching the pattern
 */
export const filterByPattern = (
    files: ReadonlyArray<string>,
    pattern: RegExp
): ReadonlyArray<string> =>
    files.filter(file => pattern.test(file));
