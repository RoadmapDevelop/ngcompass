import { minimatch } from "minimatch";
import { ConfigIssue } from "@ngcompass/common";
import { MESSAGES } from "../messages.js";
import { ConfigBlockValidation, ValidatedConfig } from "../types.js";

function validateSingleGlob(
    field: string,
    pattern: string,
    index: number,
    basePath: (string | number)[]
): ConfigIssue[] {
    const issues: ConfigIssue[] = [];
    const path = [...basePath, field, index];

    // Check for empty patterns
    if (!pattern || pattern.trim() === "") {
        issues.push({ ...MESSAGES.EMPTY_GLOB_PATTERN(field), path });
        return issues;
    }

    // Check for unclosed brackets
    if (pattern.includes("[") && !pattern.includes("]")) {
        issues.push({ ...MESSAGES.INVALID_GLOB_PATTERN(pattern, "unclosed bracket"), path });
        return issues;
    }

    // Check for invalid path patterns
    if (pattern.startsWith("///") || pattern.match(/\/\/\//)) {
        issues.push({ ...MESSAGES.INVALID_GLOB_PATTERN(pattern, "invalid path pattern with multiple slashes"), path });
        return issues;
    }

    // Trailing slash
    if (pattern.endsWith("\\") || pattern.endsWith("/")) {
        issues.push({ ...MESSAGES.INVALID_GLOB_PATTERN(pattern, "trailing slash not allowed"), path });
    }

    // Unmatched braces
    if ((pattern.match(/\{/g) || []).length !== (pattern.match(/\}/g) || []).length) {
        issues.push({ ...MESSAGES.INVALID_GLOB_PATTERN(pattern, "unmatched braces"), path });
    }

    // Try minimatch
    try {
        minimatch("sample.ts", pattern);
    } catch (err) {
        issues.push({ ...MESSAGES.INVALID_GLOB_PATTERN(pattern, (err as Error).message), path });
    }

    return issues;
}

export function validateGlobPatterns(
    config: ValidatedConfig,
    basePath: (string | number)[] = []
): ConfigBlockValidation {
    const issues: ConfigIssue[] = [];

    const fields = ["include", "exclude", "ignorePatterns"] as const;

    for (const field of fields) {
        const patterns = config[field];
        if (!patterns) continue;

        patterns.forEach((pattern, index) => {
            issues.push(...validateSingleGlob(field, pattern, index, basePath));
        });

        // Check for duplicates
        const duplicates = patterns.filter((item, index) => patterns.indexOf(item) !== index);
        if (duplicates.length > 0) {
            issues.push({
                ...MESSAGES.DUPLICATE_PATTERNS(field, [...new Set(duplicates)]),
                path: [...basePath, field]
            });
        }
    }

    // Check for empty include/exclude
    if (!config.include || config.include.length === 0) {
        issues.push({ ...MESSAGES.EMPTY_INCLUDE(), path: [...basePath, "include"] });
    }

    if (!config.exclude || config.exclude.length === 0) {
        issues.push({ ...MESSAGES.EMPTY_EXCLUDE(), path: [...basePath, "exclude"] });
    }

    return { issues };
}