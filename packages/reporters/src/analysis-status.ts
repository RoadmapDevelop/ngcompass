/**
 * @fileoverview
 * Derives the overall analysis status (`PASS` / `WARN` / `FAILED`) from a
 * result summary.
 *
 * Encapsulates the three policy levers — `totalErrors`, the warning
 * threshold (`maxWarnings`), and the user-facing `failOnSeverity` — in one
 * place so every reporter produces the same verdict for the same numbers.
 */

import type { ResultSummary } from './types.js';

export type AnalysisStatus = 'passed' | 'passed-with-warnings' | 'failed';

export interface AnalysisStatusInfo {
    readonly status: AnalysisStatus;
    readonly label: 'PASS' | 'WARN' | 'FAILED';
}

/**
 * Fallback warning ceiling when the summary doesn't carry one. Mirrors the
 * default declared in `@ngcompass/config`'s `DEFAULT_CONFIG.maxWarnings` —
 * duplicated here only to avoid an upstream package import (reporters sit
 * lower in the dependency graph). Keep the two values in sync.
 */
const DEFAULT_MAX_WARNINGS = 10;

/**
 * Computes the run-level verdict from a `ResultSummary`.
 *
 * Rules applied in order:
 *  1. Any `totalErrors > 0` → `FAILED`.
 *  2. `failOnSeverity === 'warn'` AND any warning present → `FAILED`.
 *  3. `totalWarnings > maxWarnings` → `FAILED`.
 *  4. Any warning present → `WARN`.
 *  5. Otherwise → `PASS`.
 */
export function getAnalysisStatus(
    summary: Pick<ResultSummary, 'totalErrors' | 'totalWarnings' | 'failOnSeverity' | 'maxWarnings'>,
): AnalysisStatusInfo {
    const failOnSeverity = summary.failOnSeverity ?? 'error';
    const maxWarnings = summary.maxWarnings ?? DEFAULT_MAX_WARNINGS;

    if (
        summary.totalErrors > 0
        || (failOnSeverity === 'warn' && summary.totalWarnings > 0)
        || summary.totalWarnings > maxWarnings
    ) {
        return { status: 'failed', label: 'FAILED' };
    }

    if (summary.totalWarnings > 0) {
        return { status: 'passed-with-warnings', label: 'WARN' };
    }

    return { status: 'passed', label: 'PASS' };
}
