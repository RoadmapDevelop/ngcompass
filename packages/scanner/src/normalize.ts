import path from 'node:path';
import type { ScanOptions, NormalizedOptions } from './types.js';

/**
 * Default include patterns
 */
const DEFAULT_INCLUDE = ['**/*.ts', '**/*.html'] as const;

/**
 * Normalizes scan options by applying defaults and resolving paths.
 *
 * Pure function:
 * - No side effects
 * - Deterministic (same input = same output)
 * - Returns new object
 *
 * @param options - Raw scan options
 * @returns Normalized options with defaults applied
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
 * Validates that options are reasonable.
 *
 * Pure function - returns errors as data, not exceptions.
 *
 * @param options - Options to validate
 * @returns Array of validation errors (empty if valid)
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
