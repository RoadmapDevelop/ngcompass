/**
 * @fileoverview
 * Scanner-options normalization and validation.
 *
 * `normalizeOptions` applies defaults and resolves the project root once at
 * scan kickoff so downstream pipeline stages can treat every field as
 * present. `validateOptions` flags structural problems before the scan
 * starts; today it returns plain strings, but each entry already reads
 * like an error message.
 */

import path from 'node:path';
import type { NormalizedOptions, ScanOptions } from './types.js';

/** Default include globs used when the caller doesn't supply any. */
const DEFAULT_INCLUDE = [
    '**/*.ts',
    '**/*.html',
    '**/*.scss',
    '**/*.css',
    '**/*.sass',
    '**/*.less',
] as const;

/**
 * Applies defaults and resolves the project root.
 *
 * @param options - Raw caller-supplied options.
 * @returns A fully populated {@link NormalizedOptions}.
 */
export const normalizeOptions = (options: ScanOptions): NormalizedOptions => ({
    rootDir: path.resolve(options.rootDir),
    include: options.include.length > 0 ? options.include : DEFAULT_INCLUDE,
    exclude: options.exclude,
    ignorePatterns: options.ignorePatterns ?? [],
    respectGitignore: options.respectGitignore ?? true,
    followSymlinks: options.followSymlinks ?? false,
    dot: options.dot ?? false,
});

/**
 * Returns a list of structural problems with `options`. An empty array
 * means the configuration is valid.
 */
export const validateOptions = (options: ScanOptions): ReadonlyArray<string> => {
    const errors: string[] = [];

    if (!options.rootDir || options.rootDir.trim() === '') {
        errors.push('rootDir cannot be empty');
    }

    if (!options.include || options.include.length === 0) {
        errors.push('No include patterns specified (will use defaults)');
    }

    return errors;
};
