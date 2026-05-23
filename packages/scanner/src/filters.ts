/**
 * @fileoverview
 * File filtering utilities for the scanner.
 *
 * Pure-functional primitives (`deduplicateFiles`, `filterByExtension`,
 * `filterByPattern`, `filterByGlob`) plus the orchestration helper
 * (`applyFilters`) that wires gitignore + dedup together during a scan.
 *
 * Every helper takes a `ReadonlyArray` and returns a new array — callers
 * never observe in-place mutation.
 */

import path from 'node:path';
import { minimatch } from 'minimatch';
import { loadAllGitignoreFilters } from './gitignore.js';
import {
    Err,
    Ok,
    type FilteredFileList,
    type GitignoreFilter,
    type NormalizedOptions,
    type RawFileList,
    type Result,
} from './types.js';

/** Removes duplicate paths while preserving order. */
export const deduplicateFiles = (files: ReadonlyArray<string>): ReadonlyArray<string> =>
    Array.from(new Set(files));

/**
 * Applies a {@link GitignoreFilter} to `files`. The filter returns `true`
 * for paths that should be kept.
 */
export const applyGitignoreFilter = (
    files: ReadonlyArray<string>,
    rootDir: string,
    filter: GitignoreFilter,
): ReadonlyArray<string> => files.filter((file) => filter(file, rootDir));

/**
 * Runs the full filter pipeline (gitignore → dedup) and returns the
 * filtered list together with the number of entries removed.
 */
export const applyFilters = async (
    rawFiles: RawFileList,
    options: NormalizedOptions,
): Promise<Result<FilteredFileList>> => {
    try {
        let files = rawFiles.files;
        const startCount = files.length;

        if (options.respectGitignore) {
            const filterResult = await loadAllGitignoreFilters(options.rootDir, files);
            if (!filterResult.ok) return filterResult;
            files = applyGitignoreFilter(files, options.rootDir, filterResult.data);
        }

        files = deduplicateFiles(files);

        return Ok({ files, filtered: startCount - files.length });
    } catch (error) {
        return Err(new Error(`Filtering failed: ${(error as Error).message}`));
    }
};

/**
 * Keeps only files whose extension is in `extensions`. Files without an
 * extension never match — the previous implementation returned the full
 * path when no `.` was present, which silently produced never-matching
 * lookups against the extension `Set`.
 */
export const filterByExtension = (
    files: ReadonlyArray<string>,
    extensions: ReadonlyArray<string>,
): ReadonlyArray<string> => {
    const extSet = new Set(extensions);
    return files.filter((file) => {
        const dotIndex = file.lastIndexOf('.');
        if (dotIndex === -1) return false;
        // Skip dot-prefixed basenames (`.gitignore`) by ensuring the dot
        // isn't at index 0 of the basename.
        const slashIndex = Math.max(file.lastIndexOf('/'), file.lastIndexOf('\\'));
        if (dotIndex <= slashIndex + 1) return false;
        return extSet.has(file.substring(dotIndex));
    });
};

/** Keeps files matching a regular expression. */
export const filterByPattern = (
    files: ReadonlyArray<string>,
    pattern: RegExp,
): ReadonlyArray<string> => files.filter((file) => pattern.test(file));

/**
 * Filters a file list by glob include/ignore patterns. Paths are tested
 * relative to `rootDir` with forward-slash separators (cross-platform).
 */
export const filterByGlob = (
    files: ReadonlyArray<string>,
    includes: ReadonlyArray<string>,
    ignores: ReadonlyArray<string>,
    rootDir: string,
): ReadonlyArray<string> =>
    files.filter((file) => {
        const relativePath = path.relative(rootDir, file).replace(/\\/g, '/');
        const isIncluded = includes.some((p) => minimatch(relativePath, p, { dot: true }));
        if (!isIncluded) return false;
        const isIgnored = ignores.some((p) => minimatch(relativePath, p, { dot: true }));
        return !isIgnored;
    });
