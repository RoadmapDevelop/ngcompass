/**
 * @fileoverview
 * Provides utilities for the expansion and normalization of glob patterns.
 *
 * Implements deterministic transformations to ensure cross-platform compatibility
 * and validates pattern syntax before scanner execution.
 */

import type { NormalizedOptions, ExpandedPatterns } from './types.js';

/**
 * Normalizes a glob pattern by ensuring the use of forward slashes.
 *
 * @param pattern - The pattern to normalize.
 * @returns The normalized pattern string.
 */
export const normalizePattern = (pattern: string): string =>
    pattern.replace(/\\/g, '/');

/**
 * Expands configuration options into normalized inclusion and exclusion patterns.
 *
 * @param options - The normalized scanner options.
 * @returns An object containing expanded include and ignore pattern collections.
 */
export const expandPatterns = (options: NormalizedOptions): ExpandedPatterns => ({
    include: options.include.map(normalizePattern),
    ignore: [
        ...options.exclude.map(normalizePattern),
        ...options.ignorePatterns.map(normalizePattern)
    ]
});

/**
 * Evaluates whether a glob pattern adheres to supported syntax rules.
 *
 * @param pattern - The pattern to validate.
 * @returns True if the pattern is structurally valid.
 */
export const isValidPattern = (pattern: string): boolean => {
    if (pattern.trim() === '') return false;
    if (pattern.includes('***')) return false;
    return true;
};

/**
 * Validates a collection of patterns, segregating them into valid and erroneous sets.
 *
 * @param patterns - The patterns to evaluate.
 * @returns A tuple containing the valid patterns and a collection of error messages.
 */
export const validatePatterns = (
    patterns: ReadonlyArray<string>
): readonly [ReadonlyArray<string>, ReadonlyArray<string>] => {
    const valid: string[] = [];
    const errors: string[] = [];

    for (const pattern of patterns) {
        if (isValidPattern(pattern)) {
            valid.push(pattern);
        } else {
            errors.push(`Invalid pattern: "${pattern}"`);
        }
    }

    return [valid, errors];
};
