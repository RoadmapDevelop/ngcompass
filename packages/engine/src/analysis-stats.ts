/**
 * @fileoverview
 * Aggregate statistics for an analysis run.
 *
 * Reduces a flat `RuleResult[]` into the `AnalysisResult.stats` shape:
 * unique-file count, totals by severity, wall-clock duration, and an
 * optional cache-hit rate threaded through from the planner's incremental
 * filter.
 */

import type { AnalysisResult, RuleFailure, RuleResult, RuleSeverity } from '@ngcompass/common';

/**
 * Builds the `stats` field of an `AnalysisResult`.
 *
 * @param results       - Flat result list produced by the engine.
 * @param startTime     - High-resolution timestamp captured at analysis start.
 * @param cacheHitRate  - Optional pre-computed ratio in `[0, 1]`.
 * @returns Aggregate statistics suitable for embedding in `AnalysisResult`.
 */
export const calculateStats = (
    results: ReadonlyArray<RuleResult>,
    startTime: number,
    cacheHitRate?: number,
): AnalysisResult['stats'] => {
    const duration = performance.now() - startTime;
    const failures = results.flatMap((r) => r.failures);

    const uniqueFiles = new Set<string>(failures.map((f: RuleFailure) => f.filePath));

    let totalErrors = 0;
    let totalWarnings = 0;
    for (const failure of failures) {
        if (isErrorSeverity(failure.severity)) totalErrors++;
        else if (isWarningSeverity(failure.severity)) totalWarnings++;
    }

    return {
        totalFiles: uniqueFiles.size,
        totalErrors,
        totalWarnings,
        duration,
        cacheHitRate,
    };
};

/** Returns `true` when `severity` marks a terminal error. */
const isErrorSeverity = (severity: RuleSeverity): boolean => severity === 'error';

/** Returns `true` when `severity` marks a non-terminal warning. */
const isWarningSeverity = (severity: RuleSeverity): boolean => severity === 'warn';
