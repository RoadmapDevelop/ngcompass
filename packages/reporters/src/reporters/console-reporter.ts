import pc from 'picocolors';
import path from 'node:path';
import process from 'node:process';
import type {
    ParseError,
    ConsoleReporterOptions,
    Reporter,
    ResultSummary,
} from '../types.js';
import type { ReporterOutput } from '../output.js';
import { processOutput } from '../output.js';
import { isErrorSeverity, compareByPosition } from '../severity-utils.js';
import { renderCodeFrame, defaultSourceReader, type SourceReader } from '../code-frame.js';
import { RuleFailure, RuleResult } from '@ngcompass/common';

// ---------------------------------------------------------------------------
// Named constants — no magic numbers or inline literals
// ---------------------------------------------------------------------------

/** Column width reserved for the "error" label in compact mode (`'error'.length`). */
const TYPE_WIDTH_ERROR = 5;

/** Column width reserved for the "warning" label in compact mode (`'warning'.length`). */
const TYPE_WIDTH_WARNING = 7;

/**
 * Number of lines to skip at the start of `Error.stack` to omit the redundant
 * header line, which duplicates `error.message`.
 */
const STACK_HEADER_LINE_SKIP = 1;

/**
 * Trailing-period pattern stripped from violation messages before display.
 *
 * Why: messages are embedded inside sentences in compact mode; a terminal period
 * creates double-punctuation (e.g. "Use OnPush.. something"). Named so the
 * same regex is not silently duplicated across multiple render helpers.
 */
const TRAILING_PERIOD_RE = /\.$/;

// ---------------------------------------------------------------------------
// Pure terminal helpers
// ---------------------------------------------------------------------------


/**
 * Builds an indexed separator line:
 *
 *   ───────────────────────────────[3/33]─
 *
 * The index label is right-aligned; dashes fill the remaining width.
 * This acts as a header bar for each failure card, replacing the plain
 * `────────────────────────────────────` separator from the previous design.
 *
 * @param index - 1-based card index.
 * @param total - Total number of failures across all files.
 */
function buildIndexedSeparator(index: number, total: number): string {
    const label = `[${index}/${total}]`;
    const FIXED_WIDTH = 160;
    // Dotted line with label at the end, total width 160
    const dotCount = Math.max(1, FIXED_WIDTH - label.length);
    const content = '·'.repeat(dotCount) + label;
    return pc.dim(pc.gray(content));
}

// ---------------------------------------------------------------------------
// Pure severity counts (no I/O — satisfies Command-Query Separation)
// ---------------------------------------------------------------------------

interface SeverityCounts {
    readonly errorCount: number;
    readonly warningCount: number;
}

/**
 * Counts failures by severity category.
 *
 * Pure function — no rendering, no side effects.
 * Computed separately from rendering to satisfy Command-Query Separation.
 */
function countSeverities(failures: readonly RuleFailure[]): SeverityCounts {
    let errorCount = 0;
    let warningCount = 0;
    for (const failure of failures) {
        if (isErrorSeverity(failure.severity)) {
            errorCount++;
        } else {
            warningCount++;
        }
    }
    return { errorCount, warningCount };
}

// ---------------------------------------------------------------------------
// Pure grouping / sorting helpers
// ---------------------------------------------------------------------------

/**
 * Groups failures by relative file path, keyed to `cwd`.
 *
 * Uses a reduce accumulator so the Map is built declaratively.
 * `path.relative` is applied once per failure to avoid repeated computation
 * inside the render loop.
 */
function groupFailuresByFile(
    failures: readonly RuleFailure[],
    cwd: string,
): Map<string, RuleFailure[]> {
    return failures.reduce<Map<string, RuleFailure[]>>((map, failure) => {
        const relativePath = path.relative(cwd, failure.filePath);
        const existing = map.get(relativePath) ?? [];
        return map.set(relativePath, [...existing, failure]);
    }, new Map());
}

/** Returns a new array of failures sorted by source position. */
function sortedByPosition(failures: RuleFailure[]): RuleFailure[] {
    return [...failures].sort(compareByPosition);
}

/** Returns true when any failure in the list is a warning-level severity. */
function hasAnyWarnings(failures: RuleFailure[]): boolean {
    return failures.some(failure => !isErrorSeverity(failure.severity));
}

/**
 * Computes the maximum display width of any `"line:col"` location string
 * in the set, used to left-pad all locations to a consistent column width.
 */
function computeLocationWidth(failures: RuleFailure[]): number {
    return failures.reduce((max, failure) => Math.max(max, `${failure.line}:${failure.column}`.length), 0);
}

function buildSummaryLine(errorCount: number, warningCount: number): string {
    const total = errorCount + warningCount;
    // Error problem count is red, warning-only is yellow
    const xColor = errorCount > 0 ? pc.red : pc.yellow;
    return (
        `${xColor('×')} ${total} problem${total !== 1 ? 's' : ''} ` +
        `(${errorCount} error${errorCount !== 1 ? 's' : ''}, ` +
        `${warningCount} warning${warningCount !== 1 ? 's' : ''})`
    );
}

// ---------------------------------------------------------------------------
// Compact-mode pure formatter
// ---------------------------------------------------------------------------

function buildCompactFailureLine(
    failure: RuleFailure,
    locationWidth: number,
    typeWidth: number,
): string {
    const isError = isErrorSeverity(failure.severity);
    const location = `${failure.line}:${failure.column}`;
    const type = isError ? 'error' : 'warning';
    const colorFn = isError ? pc.red : pc.yellow;
    const locationPad = ' '.repeat(locationWidth - location.length);
    const typePad = ' '.repeat(typeWidth - type.length);

    return (
        `${pc.gray(location)}${locationPad}  ` +
        `${colorFn(type)}${typePad}  ` +
        `${failure.message.replace(TRAILING_PERIOD_RE, '')}  ` +
        `${pc.gray(failure.ruleName)}`
    );
}

// ---------------------------------------------------------------------------
// Rich-mode pure formatters
// ---------------------------------------------------------------------------

/**
 * Builds the card header line — severity badge on the left, file path + location on the right:
 *
 *   ██ ERROR ██  src\app\violations\rule01.ts:33:5
 *
 * No issue index is shown; the index lives in the preceding indexed separator.
 * This keeps the header concise and mirrors the style of the reference image.
 *
 * @param failure  - The rule failure being rendered.
 * @param filePath - Relative file path (already computed by the caller).
 */
function buildCardHeader(failure: RuleFailure, filePath: string): string {
    const isError = isErrorSeverity(failure.severity);
    const badge = isError
        ? pc.bgRed(pc.white(pc.bold(' FAIL ')))
        : pc.bgYellow(pc.white(pc.bold(' WARN ')));

    // Use full relative path as shown in the screenshot
    return `${badge} ${filePath}`;
}

/**
 * Builds the message line — the violation message itself:
 *
 *   TypeError: Cannot read properties of undefined (reading 'assert')
 */
function buildCardMessageLine(failure: RuleFailure): string {
    const isError = isErrorSeverity(failure.severity);
    const message = failure.message.replace(TRAILING_PERIOD_RE, '');
    const coloredMsg = isError ? pc.red(message) : pc.yellow(message);
    return `${coloredMsg}  ${pc.dim(pc.dim(failure.ruleName))}`;
}

/**
 * Builds the location line — the relative path with line and column:
 *
 *   > packages/core/tests/scanner/patterns.test.ts:403:16
 */
function buildCardLocationLine(failure: RuleFailure, filePath: string): string {
    const loc = pc.cyan(`${filePath}:${failure.line}:${failure.column}`);
    return `${pc.cyan('❯')} ${loc}`;
}

// ---------------------------------------------------------------------------
// Rich-mode failure card context DTO
// ---------------------------------------------------------------------------

/**
 * All data required to render a single failure card.
 *
 * `total` is carried alongside `index` so `buildIndexedSeparator` can produce
 * the `[X/TOTAL]` label without any external mutable state.
 */
interface FailureCard {
    readonly failure: RuleFailure;
    /** 1-based display index shown in the separator. */
    readonly index: number;
    /** Total failure count across all files — used in the `[X/TOTAL]` label. */
    readonly total: number;
    /** Relative file path, already computed by the caller. */
    readonly relFilePath: string;
    /**
     * Source lines resolved before rendering starts.
     * An empty array means the file was unreadable — the code frame is silently omitted.
     * Resolving outside the renderer keeps file I/O out of the render path (DIP).
     */
    readonly sourceLines: string[];
}

// ---------------------------------------------------------------------------
// ConsoleReporter
// ---------------------------------------------------------------------------

export class ConsoleReporter implements Reporter {
    private readonly verbose: boolean;
    private readonly compact: boolean;
    private readonly sourceReader: SourceReader;
    private readonly cwd: string;

    constructor(
        private readonly out: ReporterOutput = processOutput,
        options?: ConsoleReporterOptions,
        /**
         * Injected source reader — override in tests to avoid real filesystem access.
         * Defaults to the process-lifetime fs cache provided by code-frame.ts.
         */
        sourceReader: SourceReader = defaultSourceReader,
        /**
         * Working directory used to compute relative file paths in the output.
         * Injected (rather than read via `process.cwd()` at call-time) to keep
         * the reporter deterministic and hermetically testable without patching globals.
         *
         * @default process.cwd() — evaluated once at construction, not per-render.
         */
        cwd: string = process.cwd(),
    ) {
        this.verbose = options?.verbose ?? false;
        this.compact = options?.compact ?? false;
        this.sourceReader = sourceReader;
        this.cwd = cwd;
    }

    /**
     * Renders all rule results to the output.
     *
     * @param results - May be empty; a "no violations" message is emitted in that case.
     */
    report(results: ReadonlyArray<RuleResult>): void {
        const allFailures = this.extractAllFailures(results);

        if (allFailures.length === 0) {
            this.out.write(pc.green('✓ No violations found'));
            return;
        }

        const byFile = groupFailuresByFile(allFailures, this.cwd);
        const sortedFilePaths = Array.from(byFile.keys()).sort();

        // Counts are computed as a pure step before any I/O (CQS).
        const { errorCount, warningCount } = countSeverities(allFailures);

        this.out.write('');
        this.renderFileBlocks(byFile, sortedFilePaths, allFailures.length);
        this.out.write(pc.bold(buildSummaryLine(errorCount, warningCount)));
    }

    summary(_stats: ResultSummary): void {
        // No-op as requested: "remove that says analyzed blah blah etc"
    }

    error(error: Error): void {
        this.out.error(pc.red('× Analysis failed'));
        this.out.error(error.message);
        if (error.stack) {
            const stackWithoutHeader = error.stack.split('\n').slice(STACK_HEADER_LINE_SKIP).join('\n');
            this.out.error(pc.gray(stackWithoutHeader));
        }
    }

    step(message: string): void { this.out.write(pc.bold(message)); }
    info(message: string): void { this.out.write(pc.dim(message)); }

    /**
     * Emits a debug message only when `verbose` mode is active.
     *
     * Why `this.verbose` and not `process.env.DEBUG`:
     * routing through the injected option keeps debug output under the caller's
     * control without introducing a hidden environment-variable side-channel.
     */
    debug(message: string): void {
        if (this.verbose) {
            this.out.write(pc.gray(`[DEBUG] ${message}`));
        }
    }

    /**
     * Surfaces parse failures. No-ops gracefully on an empty array.
     *
     * @param errors - Files that could not be parsed during analysis.
     */
    parseErrors(errors: ReadonlyArray<ParseError>): void {
        if (errors.length === 0) return;
        this.out.write(pc.red(`\nParse Errors (${errors.length}):`));
        for (const parseError of errors) {
            this.out.write(pc.red(`  ${parseError.filePath}: ${parseError.message}`));
        }
    }

    // -------------------------------------------------------------------------
    // Private — orchestration
    // -------------------------------------------------------------------------

    /** Flattens results into a single typed failure list (no narrowing needed later). */
    private extractAllFailures(results: ReadonlyArray<RuleResult>): RuleFailure[] {
        return results.flatMap(result => result.failures as RuleFailure[]);
    }

    /**
     * Dispatches rendering to either compact or rich mode and appends the
     * summary divider (rich mode only). Separating dispatch from rendering
     * satisfies SRP and makes each mode independently testable.
     *
     * @param total - Total failure count; threaded through to rich-mode cards
     *                so each card's indexed separator can display `[X/TOTAL]`.
     */
    private renderFileBlocks(
        byFile: Map<string, RuleFailure[]>,
        sortedFilePaths: string[],
        total: number,
    ): void {
        if (this.compact) {
            this.renderCompactBlocks(byFile, sortedFilePaths);
            return;
        }

        this.renderRichBlocks(byFile, sortedFilePaths, total);
        // End line removed as requested
    }

    // -------------------------------------------------------------------------
    // Compact rendering (commands only — void return, no data computed here)
    // -------------------------------------------------------------------------

    private renderCompactBlocks(
        byFile: Map<string, RuleFailure[]>,
        sortedFilePaths: string[],
    ): void {
        for (const filePath of sortedFilePaths) {
            this.renderCompactFileBlock(filePath, byFile.get(filePath)!);
        }
    }

    private renderCompactFileBlock(filePath: string, failures: RuleFailure[]): void {
        const sorted = sortedByPosition(failures);
        const locationWidth = computeLocationWidth(sorted);

        // Use the wider 'warning' column width only when there are actually warnings present;
        // otherwise alignment would waste horizontal space in error-only files.
        const typeWidth = hasAnyWarnings(sorted) ? TYPE_WIDTH_WARNING : TYPE_WIDTH_ERROR;

        this.out.write(pc.underline(filePath));

        for (const failure of sorted) {
            this.out.write(buildCompactFailureLine(failure, locationWidth, typeWidth));

            if (this.verbose && failure.fix) {
                this.out.write(`      ${pc.yellow('→')} ${pc.gray(failure.fix)}`);
            }
        }

        this.out.write('');
    }

    // -------------------------------------------------------------------------
    // Rich rendering (commands only — void return)
    // -------------------------------------------------------------------------

    private renderRichBlocks(
        byFile: Map<string, RuleFailure[]>,
        sortedFilePaths: string[],
        total: number,
    ): void {
        let globalIndex = 0;

        for (const filePath of sortedFilePaths) {
            const failures = byFile.get(filePath)!;
            globalIndex = this.renderRichFileBlock(filePath, failures, globalIndex, total);
        }
    }

    /**
     * Renders all failure cards for a single file.
     *
     * Returns the updated global index so the caller can pass it to the next file
     * without relying on external mutable state.
     */
    private renderRichFileBlock(
        filePath: string,
        failures: RuleFailure[],
        startIndex: number,
        total: number,
    ): number {
        const sorted = sortedByPosition(failures);

        // Resolve source lines once per file — avoids repeated I/O per individual failure card.
        const sourceLines = this.sourceReader.readLines(sorted[0]?.filePath ?? '');

        sorted.forEach((failure, offset) => {
            this.renderRichCard({
                failure,
                index: startIndex + offset + 1,
                total,
                relFilePath: filePath,
                sourceLines,
            });
        });

        return startIndex + sorted.length;
    }

    /**
     * Renders one failure card in the new compact style:
     *
     *   ────────────────────────────────────[3/33]─
     *    ERROR  src\app\violations\rule01.ts:33:5
     *   × Avoid manual change detection  component-no-manual-detect-changes
     *
     *     31 │ this.counter++;
     *   > 33 │     this.cdr.detectChanges();
     *                ^^^^^^^^^^^^^^^^^^^^^^
     *     35 │ }
     *
     *   i Add changeDetection: ChangeDetectionStrategy.OnPush
     *
     * Layout decisions vs the old design:
     *   - Indexed separator `[X/TOTAL]` replaces the plain `────` divider and
     *     the `1  ██ ERROR ██  rule-name` header line — fewer total lines.
     *   - Badge + filepath:line:col on one line (no separate `--> path` line).
     *   - Message + rule name on one line (dimmed rule name on the right).
     *   - Fix text appears immediately after the code frame (no extra blank line
     *     between frame and fix when fix is absent — card ends cleanly).
     */
    private renderRichCard(card: FailureCard): void {
        this.out.write('');
        // ── [X/TOTAL]─
        this.out.write(buildIndexedSeparator(card.index, card.total));
        this.out.write('');

        // FAIL  path/to/file.ts
        this.out.write(buildCardHeader(card.failure, card.relFilePath));

        // Error message  rule-name
        this.out.write(buildCardMessageLine(card.failure));

        // > path/to/file.ts:line:col
        this.out.write(buildCardLocationLine(card.failure, card.relFilePath));
        this.out.write('');

        // Syntax-highlighted code frame with left padding
        this.renderCardCodeFrame(card);
        this.out.write('');


        this.renderCardRecommendation(card.failure);

    }

    private renderCardCodeFrame({ sourceLines, failure }: FailureCard): void {
        // Skip silently when the source file could not be read (e.g. temp or deleted file).
        if (sourceLines.length === 0) return;

        const frameLines = renderCodeFrame(sourceLines, failure.line, failure.column, failure.filePath);
        for (const line of frameLines) {
            this.out.write(line);
        }
    }

    private renderCardRecommendation(failure: RuleFailure): void {
        if (!failure.fix) return;
        this.out.write(`${pc.cyan('❯')} ${pc.cyan(failure.fix)}`);
        this.out.write('');
    }
}
