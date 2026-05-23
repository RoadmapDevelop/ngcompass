/**
 * @fileoverview
 * Machine-readable JSON reporter.
 *
 * Accumulates results and parse errors across the run, then emits a single
 * JSON document on `summary()`. The shape is documented in `types.ts`
 * (`DiagnosticMessage` + `FileDiagnosticResult`) so downstream consumers
 * (reviewdog, IDEs, dashboards) can rely on a stable contract independent
 * of the analyzer's internal `RuleResult` shape.
 */

import type { RuleResult, RuleSeverity } from '@ngcompass/common';
import { getAnalysisStatus } from '../analysis-status.js';
import { processOutput, type ReporterOutput } from '../output.js';
import { compareByPosition, isErrorSeverity } from '../severity-utils.js';
import type {
    DiagnosticMessage,
    FileDiagnosticResult,
    ParseError,
    Reporter,
    ResultSummary,
} from '../types.js';

const JSON_SEVERITY_ERROR = 2 as const;
const JSON_SEVERITY_WARNING = 1 as const;

/** Maps a `RuleSeverity` onto the JSON severity encoding. */
function toJsonSeverity(severity: RuleSeverity): 1 | 2 {
    return isErrorSeverity(severity) ? JSON_SEVERITY_ERROR : JSON_SEVERITY_WARNING;
}

/** Groups every failure by file path while preserving emission order. */
function groupMessagesByFile(results: readonly RuleResult[]): Map<string, DiagnosticMessage[]> {
    const map = new Map<string, DiagnosticMessage[]>();

    for (const result of results) {
        for (const failure of result.failures) {
            const message: DiagnosticMessage = {
                ruleId: failure.ruleName,
                severity: toJsonSeverity(failure.severity),
                message: failure.message,
                line: failure.line,
                column: failure.column,
            };
            const existing = map.get(failure.filePath);
            if (existing) existing.push(message);
            else map.set(failure.filePath, [message]);
        }
    }
    return map;
}

/**
 * Builds a {@link FileDiagnosticResult} from a path + messages tuple,
 * counting error/warning totals in a single pass.
 */
function toFileDiagnosticResult(
    filePath: string,
    messages: DiagnosticMessage[],
): FileDiagnosticResult {
    let errorCount = 0;
    let warningCount = 0;
    for (const m of messages) {
        if (m.severity === JSON_SEVERITY_ERROR) errorCount++;
        else warningCount++;
    }
    return { filePath, messages, errorCount, warningCount };
}

function toJsonOutput(results: readonly RuleResult[]): FileDiagnosticResult[] {
    const byFile = groupMessagesByFile(results);
    return Array.from(byFile.entries())
        .sort(([pathA], [pathB]) => pathA.localeCompare(pathB))
        .map(([filePath, messages]) =>
            toFileDiagnosticResult(filePath, [...messages].sort(compareByPosition)),
        );
}

function countViolations(results: readonly RuleResult[]): number {
    let count = 0;
    for (const result of results) count += result.failures.length;
    return count;
}

export class JsonReporter implements Reporter {
    private readonly accumulatedResults: RuleResult[] = [];
    private readonly accumulatedParseErrors: ParseError[] = [];

    constructor(private readonly out: ReporterOutput = processOutput) {}

    report(results: ReadonlyArray<RuleResult>): void {
        for (const result of results) this.accumulatedResults.push(result);
    }

    summary(stats: ResultSummary): void {
        const status = getAnalysisStatus(stats);
        this.out.write(JSON.stringify({
            summary: {
                status: status.status,
                statusLabel: status.label,
                totalViolations: countViolations(this.accumulatedResults),
                totalErrors: stats.totalErrors,
                totalWarnings: stats.totalWarnings,
                totalFiles: stats.totalFiles,
                scannedFiles: stats.scannedFiles,
                discoveredFiles: stats.discoveredFiles,
                totalTasks: stats.totalTasks,
                cachedTasks: stats.cachedTasks,
                duration: stats.duration,
                failOnSeverity: stats.failOnSeverity,
                maxWarnings: stats.maxWarnings,
                parseErrorCount: this.accumulatedParseErrors.length,
            },
            results: toJsonOutput(this.accumulatedResults),
            parseErrors: this.accumulatedParseErrors,
        }, null, 2));
    }

    error(err: Error): void {
        this.out.error(JSON.stringify({ error: err.message }, null, 2));
    }

    parseErrors(errors: ReadonlyArray<ParseError>): void {
        for (const error of errors) this.accumulatedParseErrors.push(error);
    }

    // Progress methods are no-ops for the JSON reporter — output is a single
    // document emitted on `summary()`.
    step(_message: string): void {}
    info(_message: string): void {}
    debug(_message: string): void {}
}
