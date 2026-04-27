/**
 * @fileoverview
 * Facilitates the calculation of aggregate analytical metrics.
 *
 * This module provides utilities to derive summary statistics from rule execution
 * results, including file counts, severity distributions, and execution durations.
 */

import { RuleFailure, RuleResult, AnalysisResult } from "@ngcompass/common";


/**
 * Computes comprehensive analytical statistics based on raw rule results.
 *
 * @param results A collection of rule execution results.
 * @param startTime The high-resolution timestamp indicating the start of execution.
 * @param cacheHitRate An optional precalculated cache hit ratio [0, 1].
 * @returns An object encapsulating the aggregated statistical data.
 */
export const calculateStats = (
    results: ReadonlyArray<RuleResult>,
    startTime: number,
    cacheHitRate?: number,
): AnalysisResult["stats"] => {
    const duration = performance.now() - startTime;
    const failures = results.flatMap((r) => r.failures);

    const uniqueFiles = new Set<string>(failures.map((f: RuleFailure) => f.filePath));

    const totalErrors = failures.filter((f: RuleFailure) => isErrorSeverity(f.severity)).length;
    const totalWarnings = failures.filter((f: RuleFailure) => isWarningSeverity(f.severity)).length;

    return {
        totalFiles: uniqueFiles.size,
        totalErrors,
        totalWarnings,
        duration,
        cacheHitRate,
    };
};

/**
 * Predicate to identify if a given severity level denotes a terminal error.
 *
 * @param severity The severity metadata to evaluate.
 * @returns True if the severity is classified as an error.
 */
export const isErrorSeverity = (severity: unknown): boolean => {
    return severity === "error";
};

/**
 * Predicate to identify if a given severity level denotes a non-terminal warning.
 *
 * @param severity The severity metadata to evaluate.
 * @returns True if the severity is classified as a warning.
 */
export const isWarningSeverity = (severity: unknown): boolean => {
    return severity === "warn";
};

