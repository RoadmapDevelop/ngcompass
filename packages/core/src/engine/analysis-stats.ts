/**
 * Analysis Statistics
 *
 * Calculates aggregate statistics from analysis rule results.
 * Extracted from orchestrator.ts for reuse.
 */

import type { RuleResult, AnalysisResult } from "../rules/types.js";

/**
 * Calculates aggregate statistics for analysis.
 *
 * @param results - Rule results
 * @param startTime - Start timestamp
 * @returns Stats object
 */
export const calculateStats = (results: ReadonlyArray<RuleResult>, startTime: number): AnalysisResult["stats"] => {
    const duration = performance.now() - startTime;
    const failures = results.flatMap((r) => r.failures);

    const uniqueFiles = new Set<string>(failures.map((f: any) => f.filePath));

    const totalErrors = failures.filter((f: any) => isErrorSeverity(f?.severity)).length;
    const totalWarnings = failures.filter((f: any) => isWarningSeverity(f?.severity)).length;

    return {
        totalFiles: uniqueFiles.size,
        totalErrors,
        totalWarnings,
        duration,
    };
};

/**
 * Determines whether a severity represents an error.
 *
 * @param severity - Severity value
 * @returns true if severity counts as error
 */
export const isErrorSeverity = (severity: unknown): boolean => {
    return severity === "critical" || severity === "high" || severity === "error";
};

/**
 * Determines whether a severity represents a warning.
 *
 * @param severity - Severity value
 * @returns true if severity counts as warning
 */
export const isWarningSeverity = (severity: unknown): boolean => {
    return severity === "moderate" || severity === "low" || severity === "warn";
};
