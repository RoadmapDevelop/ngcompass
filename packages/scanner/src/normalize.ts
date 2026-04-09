/**
 * @fileoverview
 * Provides utilities for the normalization and validation of scanner configurations.
 *
 * Ensures that scan options are consistent, paths are resolved, and default
 * behaviors are applied according to the project's architectural standards.
 */
import path from 'node:path';
import type { ScanOptions, NormalizedOptions } from './types.js';

/**
 * Default patterns used for file inclusion when none are explicitly provided.
 */
const DEFAULT_INCLUDE = [
    '**/*.ts',
    '**/*.html',
    '**/*.scss',
    '**/*.css',
    '**/*.sass',
    '**/*.less',
] as const;

/**
 * Normalizes scanner options by applying defaults and resolving paths.
 *
 * @param options - The raw configuration options provided by the caller.
 * @returns A new object containing fully normalized scanner options.
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
 * Validates the structural integrity of the provided scanner options.
 *
 * @param options - The options to evaluate.
 * @returns A read-only collection of validation error messages, if any.
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
