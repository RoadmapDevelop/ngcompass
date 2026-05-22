/**
 * @fileoverview
 * Validates the `include`, `exclude`, and `ignorePatterns` glob arrays.
 *
 * Performs syntactic checks (balanced braces and brackets, trailing slashes,
 * empty entries) and array-level checks (duplicates, empty `include`/`exclude`).
 * Catches malformed patterns before the scanner spends time on them.
 */

import { minimatch } from 'minimatch';
import type { ConfigIssue } from '@ngcompass/common';
import { MESSAGES } from '../messages.js';
import type { ConfigBlockValidation, ValidatedConfig } from '../types.js';

const TRIPLE_SLASH_RE = /\/\/\//;
const BRACE_OPEN_RE = /\{/g;
const BRACE_CLOSE_RE = /\}/g;
const BRACKET_OPEN_RE = /\[/g;
const BRACKET_CLOSE_RE = /\]/g;
const SAMPLE_FILE = 'sample.ts';

/**
 * Validates a single glob pattern.
 *
 * @param field - Field name owning the pattern (used in messages).
 * @param pattern - The glob string.
 * @param index - Array index for issue attribution.
 * @param basePath - Path prefix for issue attribution.
 * @returns {ConfigIssue[]} Issues for this pattern (possibly empty).
 */
function validateSingleGlob(
    field: string,
    pattern: string,
    index: number,
    basePath: (string | number)[],
): ConfigIssue[] {
    const issues: ConfigIssue[] = [];
    const path = [...basePath, field, index];

    if (!pattern || pattern.trim() === '') {
        issues.push({ ...MESSAGES.EMPTY_GLOB_PATTERN(field), path });
        return issues;
    }

    const openBrackets = (pattern.match(BRACKET_OPEN_RE) || []).length;
    const closeBrackets = (pattern.match(BRACKET_CLOSE_RE) || []).length;
    if (openBrackets !== closeBrackets) {
        issues.push({ ...MESSAGES.INVALID_GLOB_PATTERN(pattern, 'unmatched character class brackets'), path });
        return issues;
    }

    if (TRIPLE_SLASH_RE.test(pattern) || pattern.startsWith('///')) {
        issues.push({ ...MESSAGES.INVALID_GLOB_PATTERN(pattern, 'invalid path pattern with multiple slashes'), path });
        return issues;
    }

    if (pattern.endsWith('\\') || pattern.endsWith('/')) {
        issues.push({ ...MESSAGES.INVALID_GLOB_PATTERN(pattern, 'trailing slash not allowed'), path });
    }

    const openBraces = (pattern.match(BRACE_OPEN_RE) || []).length;
    const closeBraces = (pattern.match(BRACE_CLOSE_RE) || []).length;
    if (openBraces !== closeBraces) {
        issues.push({ ...MESSAGES.INVALID_GLOB_PATTERN(pattern, 'unmatched braces'), path });
    }

    try {
        minimatch(SAMPLE_FILE, pattern);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        issues.push({ ...MESSAGES.INVALID_GLOB_PATTERN(pattern, message), path });
    }

    return issues;
}

/**
 * Identifies duplicates in a pattern array using a single-pass `Set`.
 * Preserves insertion order so dedup messages match user expectations.
 *
 * @returns {string[]} Deduplicated list of patterns that appeared more than once.
 */
function findDuplicates(patterns: readonly string[]): string[] {
    const seen = new Set<string>();
    const duplicates = new Set<string>();
    for (const pattern of patterns) {
        if (seen.has(pattern)) {
            duplicates.add(pattern);
        } else {
            seen.add(pattern);
        }
    }
    return [...duplicates];
}

/**
 * Validates all glob fields inside the configuration.
 *
 * @param config - Validated configuration.
 * @param basePath - Path prefix for issue attribution.
 * @returns {ConfigBlockValidation} All glob-related issues.
 */
export function validateGlobPatterns(
    config: ValidatedConfig,
    basePath: (string | number)[] = [],
): ConfigBlockValidation {
    const issues: ConfigIssue[] = [];
    const targetFields = ['include', 'exclude', 'ignorePatterns'] as const;

    for (const field of targetFields) {
        const patterns = config[field];
        if (!Array.isArray(patterns)) continue;

        for (let i = 0; i < patterns.length; i++) {
            issues.push(...validateSingleGlob(field, patterns[i], i, basePath));
        }

        const duplicates = findDuplicates(patterns);
        if (duplicates.length > 0) {
            issues.push({
                ...MESSAGES.DUPLICATE_PATTERNS(field, duplicates),
                path: [...basePath, field],
            });
        }
    }

    if (!config.include || config.include.length === 0) {
        issues.push({ ...MESSAGES.EMPTY_INCLUDE, path: [...basePath, 'include'] });
    }

    if (!config.exclude || config.exclude.length === 0) {
        issues.push({ ...MESSAGES.EMPTY_EXCLUDE, path: [...basePath, 'exclude'] });
    }

    return { issues };
}
