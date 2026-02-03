/**
 * Pattern Expansion
 *
 * Pure functions for expanding and normalizing glob patterns.
 */

import type { NormalizedOptions, ExpandedPatterns } from './types.js';

/**
 * Normalizes a single pattern to use forward slashes.
 *
 * Pure function - deterministic transformation.
 *
 * @param pattern - Pattern to normalize
 * @returns Normalized pattern with forward slashes
 */
export const normalizePattern = (pattern: string): string =>
    pattern.replace(/\\/g, '/');

/**
 * Expands options into glob-compatible patterns.
 *
 * Pure function:
 * - No side effects
 * - Deterministic
 * - Returns new object with normalized patterns
 *
 * @param options - Normalized scan options
 * @returns Expanded patterns ready for glob execution
 */
export const expandPatterns = (options: NormalizedOptions): ExpandedPatterns => ({
    include: options.include.map(normalizePattern),
    ignore: [
        ...options.exclude.map(normalizePattern),
        ...options.ignorePatterns.map(normalizePattern)
    ]
});

/**
 * Checks if a pattern is valid glob syntax.
 *
 * Pure function - no side effects.
 *
 * @param pattern - Pattern to validate
 * @returns True if pattern appears valid
 */
export const isValidPattern = (pattern: string): boolean => {
    if (pattern.trim() === '') return false;
    if (pattern.includes('***')) return false; // Invalid triple-star
    return true;
};

/**
 * Filters out invalid patterns and returns validation errors.
 *
 * Pure function - returns both valid patterns and errors.
 *
 * @param patterns - Array of patterns to validate
 * @returns Tuple of [valid patterns, error messages]
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
