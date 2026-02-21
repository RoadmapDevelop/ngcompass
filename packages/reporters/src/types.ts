/**
 * Reporter contracts and DTOs for ngcompass CLI output.
 *
 * Design goals:
 * - Tool-agnostic contracts (no ESLint coupling).
 * - Explicit, semantic naming.
 * - Composable interfaces (ISP, DIP).
 * - Clear public API documentation.
 */

import type { ConfigReport, HealthReport, InitResult } from '@ngcompass/common';
import type { RuleFailure, RuleResult, RuleSeverity } from '@ngcompass/core';

export type { RuleFailure, RuleResult, RuleSeverity };

/** Supported output encodings for analysis results. */
export type ReporterFormat = 'console' | 'json';

export interface ConsoleReporterOptions {
    /** Enables additional diagnostic output (verbose/fix recommendations). */
    readonly verbose?: boolean;

    /**
     * Uses compact, standard one-line-per-violation layout.
     * Suitable for CI environments and editor integration.
     */
    readonly compact?: boolean;
}

/**
 * Summary statistics produced at the end of an analysis run.
 *
 * Consumed by `ProgressReporter.summary()`.
 */
export interface ResultSummary {
    readonly totalFiles: number;
    readonly totalTasks: number;
    readonly cachedTasks?: number;
    readonly totalErrors: number;
    readonly totalWarnings: number;
    readonly duration: number;
}

/**
 * Core analysis reporter contract.
 *
 * @remarks
 * Implementations receive analysis results and surface them to the user.
 * `report()` must handle an empty array gracefully (emit a "no violations" message).
 * None of the methods should throw — errors are surfaced via `error()`.
 */
export interface AnalysisReporter {
    /**
     * Renders all rule results.
     * @param results - May be empty; reporters must handle this gracefully.
     */
    report(results: ReadonlyArray<RuleResult>): void;

    /**
     * Called when an unexpected runtime failure occurs during analysis.
     * @param error - The caught exception. Implementations should surface both
     *                `error.message` and (optionally) `error.stack`.
     */
    error(error: Error): void;

    /**
     * Called when one or more files could not be parsed or analyzed.
     * @param errors - Array of parse failures; implementations should no-op on empty arrays.
     */
    parseErrors(errors: ReadonlyArray<ParseError>): void;
}

/**
 * Progressive reporting contract for interactive / TTY environments.
 *
 * @remarks
 * Non-interactive reporters (e.g. `JsonReporter`) implement this with no-ops.
 * Callers that only need analysis output should accept `AnalysisReporter`, not `Reporter`.
 */
export interface ProgressReporter {
    /** Emits a bold status step, e.g. "Analyzing 42 files…". */
    summary(stats: ResultSummary): void;
    /** Emits a high-visibility progress message. */
    step(message: string): void;
    /** Emits a dim informational message. */
    info(message: string): void;
    /** Emits a debug message; may be suppressed unless verbose mode is active. */
    debug(message: string): void;
}

/**
 * Combined reporter contract expected by the CLI orchestrator.
 *
 * @remarks
 * Prefer the narrower `AnalysisReporter` or `ProgressReporter` types for
 * functions that only need one facet, to avoid forcing callers to satisfy
 * the full combined surface.
 */
export type Reporter = AnalysisReporter & ProgressReporter;

/**
 * Reporter contract for configuration-related commands (`compass config`, `compass health`).
 *
 * Separated from `Reporter` because config commands do not produce `RuleResult` output
 * and must not be forced to implement the full analysis surface.
 */
export interface ConfigReporter {
    /**
     * Renders full config validation output.
     * @param report - The validation result from the config loader.
     */
    reportConfig(report: ConfigReport): void;

    /**
     * Renders the outcome of `compass init`.
     * @param result - The init operation result (success, already-exists, or failure).
     */
    renderInitResult(result: InitResult): void;

    /**
     * Renders the full project health report.
     * @param report - Aggregated health issues, one per config concern.
     */
    renderHealthReport(report: HealthReport): void;
}

/**
 * Represents a file that could not be parsed during analysis.
 */
export interface ParseError {
    readonly filePath: string;
    readonly message: string;
}

// ---------------------------------------------------------------------------
// Structured JSON output types
// ---------------------------------------------------------------------------

/**
 * A single diagnostic message in structured JSON format.
 *
 * Severity encoding:
 * - `2` → error   (corresponds to `isErrorSeverity() === true`)
 * - `1` → warning
 *
 * Named constants (`JSON_SEVERITY_ERROR`, `JSON_SEVERITY_WARNING`) live in
 * `json-reporter.ts` to avoid exposing implementation details in the public type.
 */
export interface DiagnosticMessage {
    readonly ruleId: string;
    readonly severity: 1 | 2;
    readonly message: string;
    readonly line: number;
    readonly column: number;
}

/**
 * Per-file group of diagnostic messages.
 *
 * Produced by `JsonReporter` to allow downstream tooling (e.g. reviewdog,
 * other formatters) to consume ngcompass output without coupling to its
 * internal `RuleResult` shape.
 */
export interface FileDiagnosticResult {
    readonly filePath: string;
    readonly messages: readonly DiagnosticMessage[];
    readonly errorCount: number;
    readonly warningCount: number;
}