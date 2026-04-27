import { minimatch } from "minimatch";
import { ConfigIssue } from "@ngcompass/common";
import { MESSAGES } from "../messages.js";
import { ConfigBlockValidation, ValidatedConfig } from "../types.js";

/**
 * Constants and Regular Expressions for glob pattern validation.
 */
const GLOB_RULES = {
    TRIPLE_SLASH: /\/\/\//,
    BRACE_OPEN: /\{/g,
    BRACE_CLOSE: /\}/g,
    SAMPLE_FILE: "sample.ts"
} as const;

/**
 * Validates an individual glob pattern string against structural and 
 * syntax-based rules.
 *
 * @param field - The configuration property name (e.g., 'include').
 * @param pattern - The specific glob string to validate.
 * @param index - The array index of the pattern for error reporting.
 * @param basePath - The structural path prefix.
 * @returns An array of discovered issues for the single pattern.
 */
function validateSingleGlob(
    field: string,
    pattern: string,
    index: number,
    basePath: (string | number)[]
): ConfigIssue[] {
    const issues: ConfigIssue[] = [];
    const path = [...basePath, field, index];

    /**
     * Constraint: Content Existence
     * Patterns must not be empty or purely whitespace.
     */
    if (!pattern || pattern.trim() === "") {
        issues.push({ ...MESSAGES.EMPTY_GLOB_PATTERN(field), path });
        return issues;
    }

    /**
     * Syntax: Character Class Integrity
     * Checks for common errors like unclosed brackets.
     */
    if (pattern.includes("[") && !pattern.includes("]")) {
        issues.push({ ...MESSAGES.INVALID_GLOB_PATTERN(pattern, "unclosed bracket"), path });
        return issues;
    }

    /**
     * Syntax: Path Separators
     * Prevents invalid path constructs like triple slashes or trailing slashes.
     */
    const hasTripleSlash = GLOB_RULES.TRIPLE_SLASH.test(pattern) || pattern.startsWith("///");
    if (hasTripleSlash) {
        issues.push({ ...MESSAGES.INVALID_GLOB_PATTERN(pattern, "invalid path pattern with multiple slashes"), path });
        return issues;
    }

    if (pattern.endsWith("\\") || pattern.endsWith("/")) {
        issues.push({ ...MESSAGES.INVALID_GLOB_PATTERN(pattern, "trailing slash not allowed"), path });
    }

    /**
     * Syntax: Braces Balancing
     * Ensures that expansion braces {} are correctly balanced.
     */
    const openBraces = (pattern.match(GLOB_RULES.BRACE_OPEN) || []).length;
    const closeBraces = (pattern.match(GLOB_RULES.BRACE_CLOSE) || []).length;

    if (openBraces !== closeBraces) {
        issues.push({ ...MESSAGES.INVALID_GLOB_PATTERN(pattern, "unmatched braces"), path });
    }

    /**
     * Engine: Minimatch Verification
     * Performs a dry-run using the underlying library to catch deeper syntax errors.
     */
    try {
        minimatch(GLOB_RULES.SAMPLE_FILE, pattern);
    } catch (err) {
        issues.push({ ...MESSAGES.INVALID_GLOB_PATTERN(pattern, (err as Error).message), path });
    }

    return issues;
}

/**
 * Validates all glob-based fields within the configuration, including 
 * uniqueness checks and mandatory field presence.
 *
 * @param config - The composed configuration object.
 * @param basePath - The structural path prefix.
 * @returns A validation result containing all glob-related issues.
 */
export function validateGlobPatterns(
    config: ValidatedConfig,
    basePath: (string | number)[] = []
): ConfigBlockValidation {
    const issues: ConfigIssue[] = [];
    const targetFields = ["include", "exclude", "ignorePatterns"] as const;

    /**
     * Iterative Check: Field-Level Validation
     * Processes each glob field to check for individual pattern validity 
     * and array-wide properties like uniqueness.
     */
    for (const field of targetFields) {
        const patterns = config[field];

        /**
         * Guard: Array Integrity
         * Skips processing if the field is missing or incorrectly typed 
         * (e.g., due to a failed schema cast).
         */
        if (!Array.isArray(patterns)) {
            continue;
        }

        /**
         * Logic: Pattern Syntax
         * Delegates individual string validation to the helper function.
         */
        patterns.forEach((pattern, index) => {
            issues.push(...validateSingleGlob(field, pattern, index, basePath));
        });

        /**
         * Logic: Uniqueness
         * Identifies duplicate patterns within the same field to prevent 
         * redundant processing.
         */
        const duplicates = patterns.filter((item, index) => patterns.indexOf(item) !== index);
        if (duplicates.length > 0) {
            issues.push({
                ...MESSAGES.DUPLICATE_PATTERNS(field, [...new Set(duplicates)]),
                path: [...basePath, field]
            });
        }
    }

    /**
     * Integrity: Mandatory Collections
     * Ensures that 'include' and 'exclude' are not empty, as this would 
     * result in an invalid or ineffective analysis run.
     */
    if (!config.include || config.include.length === 0) {
        issues.push({ ...MESSAGES.EMPTY_INCLUDE(), path: [...basePath, "include"] });
    }

    if (!config.exclude || config.exclude.length === 0) {
        issues.push({ ...MESSAGES.EMPTY_EXCLUDE(), path: [...basePath, "exclude"] });
    }

    return { issues };
}