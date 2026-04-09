import type {
    FileDiagnosticResult,
    DiagnosticMessage,
    ParseError,
    Reporter,
    ResultSummary,
} from '../types.js';
import type { ReporterOutput } from '../output.js';
import { processOutput } from '../output.js';
import { isErrorSeverity, compareByPosition } from '../severity-utils.js';
import { RuleResult, Severity } from '@ngcompass/common';

// JSON format severity constants — named to avoid inline magic numbers.
const JSON_SEVERITY_ERROR = 2 as const;
const JSON_SEVERITY_WARNING = 1 as const;

// ---------------------------------------------------------------------------
// Pure mapping helpers
// ---------------------------------------------------------------------------

function toJsonSeverity(severity: Severity): 1 | 2 {
    return isErrorSeverity(severity) ? JSON_SEVERITY_ERROR : JSON_SEVERITY_WARNING;
}

/**
 * Groups failures from all rule results into a file-keyed map.
 *
 * Pure function — no sorting, no specific mapping; only grouping.
 * Separated from `toFileDiagnosticResult` to satisfy Function Atomicity.
 *
 * Why push() instead of spread-accumulate ([...existing, item]):
 * spread-accumulate is O(n²) in total allocations when there are many failures
 * per file. Mutation of the Map's own array is safe here since the Map itself
 * is local to the enclosing function.
 */
function groupMessagesByFile(results: readonly RuleResult[]): Map<string, DiagnosticMessage[]> {
    const map = new Map<string, DiagnosticMessage[]>();

    for (const result of results) {
        for (const failure of result.failures) {
            const message: DiagnosticMessage = {
                ruleId: failure.ruleName,
                severity: toJsonSeverity(failure.severity as Severity),
                message: failure.message,
                line: failure.line,
                column: failure.column,
            };

            const existing = map.get(failure.filePath);
            if (existing) {
                existing.push(message);
            } else {
                map.set(failure.filePath, [message]);
            }
        }
    }

    return map;
}

/**
 * Converts a sorted message list into a `FileDiagnosticResult`.
 *
 * Counts are derived here (not passed in) to keep each field a single source of truth.
 */
function toFileDiagnosticResult(filePath: string, messages: DiagnosticMessage[]): FileDiagnosticResult {
    return {
        filePath,
        messages,
        errorCount: messages.filter(m => m.severity === JSON_SEVERITY_ERROR).length,
        warningCount: messages.filter(m => m.severity === JSON_SEVERITY_WARNING).length,
    };
}

/**
 * Converts raw rule results into a structured JSON array.
 *
 * Output is sorted alphabetically by file path, then by line/column within
 * each file, to produce deterministic and diff-friendly output.
 */
function toJsonOutput(results: readonly RuleResult[]): FileDiagnosticResult[] {
    const byFile = groupMessagesByFile(results);

    return Array.from(byFile.entries())
        .sort(([pathA], [pathB]) => pathA.localeCompare(pathB))
        .map(([filePath, messages]) =>
            toFileDiagnosticResult(filePath, [...messages].sort(compareByPosition)),
        );
}

// ---------------------------------------------------------------------------
// JsonReporter
// ---------------------------------------------------------------------------

export class JsonReporter implements Reporter {
    constructor(private readonly out: ReporterOutput = processOutput) { }

    /**
     * Emits the analysis results as a formatted JSON array to stdout.
     *
     * @param results - All rule results from the analysis run.
     */
    report(results: ReadonlyArray<RuleResult>): void {
        this.out.write(JSON.stringify(toJsonOutput(results), null, 2));
    }

    /**
     * No-op — JSON consumers parse the emitted array rather than reading a summary line.
     * The underscore prefix signals intentional non-use to linters.
     */
    summary(_stats: ResultSummary): void { }

    /**
     * Emits a structured JSON error object to stderr.
     *
     * @param err - The caught exception.
     */
    error(err: Error): void {
        this.out.error(JSON.stringify({ error: err.message }, null, 2));
    }

    // Progressive reporter methods are no-ops in JSON mode:
    // all progress/diagnostic messages would contaminate the structured stdout stream.
    step(_message: string): void { }
    info(_message: string): void { }
    debug(_message: string): void { }

    /**
     * Writes parse failures as a structured JSON object to stderr.
     *
     * Why stderr: parse errors must remain visible in CI pipelines without
     * contaminating the structured JSON written to stdout.
     *
     * @param errors - Files that could not be parsed during analysis.
     */
    parseErrors(errors: ReadonlyArray<ParseError>): void {
        if (errors.length === 0) return;
        this.out.error(JSON.stringify({ parseErrors: errors }, null, 2));
    }
}
