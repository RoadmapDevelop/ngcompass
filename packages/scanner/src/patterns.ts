/**
 * @fileoverview
 * Glob-pattern expansion and validation utilities for the scanner.
 *
 * Normalizes platform-specific separators, expands user-supplied options
 * into the `(include, ignore)` shape consumed by the glob engine, and
 * provides a basic structural validator that callers can use to fail fast
 * on obvious typos before the scan starts.
 */

import type { ExpandedPatterns, NormalizedOptions } from './types.js';

/** Replaces backslashes with forward slashes for cross-platform glob input. */
export const normalizePattern = (pattern: string): string =>
    pattern.replace(/\\/g, '/');

/**
 * Expands normalized options into the include/ignore shape consumed by the
 * glob engine. `ignorePatterns` and `exclude` are merged into one ignore
 * list — both have identical glob semantics, only the field name differs.
 */
export const expandPatterns = (options: NormalizedOptions): ExpandedPatterns => ({
    include: options.include.map(normalizePattern),
    ignore: [
        ...options.exclude.map(normalizePattern),
        ...options.ignorePatterns.map(normalizePattern),
    ],
});

/**
 * Returns `true` when `pattern` is structurally plausible as a glob.
 *
 * Catches the obvious typos that minimatch / tinyglobby silently accept and
 * later fail to match. Specifically:
 *  - Empty / whitespace-only patterns.
 *  - `***` (treated literally, never matches what users intend).
 *  - Unbalanced `{` / `}` (brace expansion).
 *  - Unbalanced `[` / `]` (character classes).
 *  - Trailing path separators (`'foo/'`).
 *
 * The validation is conservative: false positives (rejecting a legal-but-
 * weird pattern) are preferable to false negatives that produce empty
 * scan results.
 */
export const isValidPattern = (pattern: string): boolean => {
    if (pattern.trim() === '') return false;
    if (pattern.includes('***')) return false;
    if (pattern.endsWith('/') || pattern.endsWith('\\')) return false;
    if (!balanced(pattern, '{', '}')) return false;
    if (!balanced(pattern, '[', ']')) return false;
    return true;
};

/**
 * Validates a list of patterns, returning the subset that survived plus the
 * collection of human-readable error messages for the ones that didn't.
 */
export const validatePatterns = (
    patterns: ReadonlyArray<string>,
): readonly [ReadonlyArray<string>, ReadonlyArray<string>] => {
    const valid: string[] = [];
    const errors: string[] = [];
    for (const pattern of patterns) {
        if (isValidPattern(pattern)) valid.push(pattern);
        else errors.push(`Invalid pattern: "${pattern}"`);
    }
    return [valid, errors];
};

// ── Internal helpers ──────────────────────────────────────────────────────

/** Returns `true` when `open` and `close` occur the same number of times in `s`. */
function balanced(s: string, open: string, close: string): boolean {
    let depth = 0;
    for (let i = 0; i < s.length; i++) {
        if (s[i] === open) depth++;
        else if (s[i] === close) depth--;
    }
    return depth === 0;
}
