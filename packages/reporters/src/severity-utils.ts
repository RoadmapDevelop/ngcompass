import type { RuleSeverity } from '@ngcompass/common';

/**
 * Numeric priority values for each severity level.
 *
 * Why numeric priorities:
 * - Enables deterministic sorting.
 * - Prevents scattered "magic numbers".
 * - Centralizes severity ordering logic.
 *
 * Lower number = higher priority.
 */
const SEVERITY_PRIORITY: Readonly<Record<RuleSeverity, number>> = {
    critical: 0,
    high: 1,
    error: 2,
    moderate: 3,
    warning: 4,
    low: 5,
    info: 6,
    hint: 7,
    off: 8,
} as const;

/**
 * Set of severities considered fatal to the analysis result.
 *
 * Why a Set instead of inline conditionals:
 * - O(1) lookup.
 * - Single source of truth.
 * - Easier to extend without modifying logic.
 */
const ERROR_SEVERITIES: ReadonlySet<RuleSeverity> = new Set([
    'critical',
    'high',
    'error',
]);

/**
 * Determines whether a severity represents a hard failure.
 *
 * Contract:
 * - Returns true for severities that should fail CI or block builds.
 * - Returns false for informational or advisory severities.
 */
export function isErrorSeverity(severity: RuleSeverity): boolean {
    return ERROR_SEVERITIES.has(severity);
}

/**
 * Returns the numeric priority rank of a severity.
 *
 * Lower numbers indicate higher priority.
 *
 * This function is safe against future severity additions,
 * as long as they are defined in SEVERITY_PRIORITY.
 */
export function severityRank(severity: RuleSeverity): number {
    return SEVERITY_PRIORITY[severity] ?? Number.MAX_SAFE_INTEGER;
}

/**
 * Represents a source code position.
 *
 * Extracted as a named contract to improve readability and reuse.
 */
export interface SourcePosition {
    readonly line: number;
    readonly column: number;
}

/**
 * Comparator for deterministic sorting by source position.
 *
 * Sorting order:
 * 1. Line number ascending
 * 2. Column number ascending
 *
 * This ensures stable and predictable reporter output.
 */
export function compareByPosition(
    a: SourcePosition,
    b: SourcePosition,
): number {
    if (a.line !== b.line) {
        return a.line - b.line;
    }

    return a.column - b.column;
}