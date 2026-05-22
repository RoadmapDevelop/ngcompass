/**
 * @fileoverview
 * Severity ordering and classification helpers shared by every reporter.
 *
 * Centralizes "is this severity an error?" and "how do I sort by source
 * position?" so reporter implementations never re-encode the rule. Reporters
 * use these helpers to keep their output deterministic and aligned with the
 * CI failure semantics the user expects.
 */

import type { RuleSeverity } from '@ngcompass/common';

/**
 * Numeric priority for each severity (lower = higher priority). Used as the
 * sort key when reporters need to surface the most important findings first.
 */
const SEVERITY_PRIORITY: Readonly<Record<RuleSeverity, number>> = {
    error: 0,
    warn: 1,
    off: 2,
} as const;

/**
 * Returns `true` when `severity` should fail CI / block a build.
 *
 * Currently only `'error'` qualifies. Kept as a function (not an inline
 * comparison) so future fail-on policies can be encoded here without
 * touching every reporter.
 */
export function isErrorSeverity(severity: RuleSeverity): boolean {
    return severity === 'error';
}

/**
 * Returns the numeric priority rank for a severity. Unknown values fall back
 * to `Number.MAX_SAFE_INTEGER` so reporters never crash on a value Zod did
 * not catch upstream.
 */
export function severityRank(severity: RuleSeverity): number {
    return SEVERITY_PRIORITY[severity] ?? Number.MAX_SAFE_INTEGER;
}

/** Named coordinates used for stable position-based sorting. */
export interface SourcePosition {
    readonly line: number;
    readonly column: number;
}

/**
 * Comparator for sorting findings by source position (line then column).
 * Stable across runs because both fields are integers.
 */
export function compareByPosition(a: SourcePosition, b: SourcePosition): number {
    if (a.line !== b.line) return a.line - b.line;
    return a.column - b.column;
}
