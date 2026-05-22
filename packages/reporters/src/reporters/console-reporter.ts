/**
 * @fileoverview
 * Rich and compact terminal reporters for the default `console` format.
 *
 * Two render modes share most of the helpers:
 *  - Compact mode (`options.compact === true`) — one line per violation,
 *    suitable for CI logs and editor problem panes.
 *  - Rich mode (default) — boxed "card" per violation with a code frame,
 *    suggestion text, and a context indicator pointing at the source line.
 *
 * Source-file reads go through an injectable `SourceReader` so unit tests
 * can capture render output without touching the filesystem.
 */

import path from 'node:path';
import process from 'node:process';
import { RuleFailure, RuleResult } from '@ngcompass/common';
import pc from 'picocolors';
import { getAnalysisStatus } from '../analysis-status.js';
import { defaultSourceReader, renderCodeFrame, type SourceReader } from '../code-frame.js';
import { processOutput, type ReporterOutput } from '../output.js';
import { compareByPosition, isErrorSeverity } from '../severity-utils.js';
import type {
    ConsoleReporterOptions,
    ParseError,
    Reporter,
    ResultSummary,
} from '../types.js';

// ---------------------------------------------------------------------------
// Named constants — no magic numbers or inline literals
// ---------------------------------------------------------------------------

/** Column width reserved for the "error" / "warn" labels in compact mode. */
const TYPE_WIDTH_COMPACT = 5;

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
function buildViolationsDivider(): string {
    const visibleLabel = '   Violations   ';
    const styledLabel = '  ' + pc.bgRed(pc.white(pc.bold(' Violations '))) + '  ';
    const width = process.stdout.columns ?? 80;
    const sides = Math.max(0, width - visibleLabel.length);
    const left = Math.floor(sides / 2);
    const right = sides - left;
    return pc.red('·'.repeat(left)) + styledLabel + pc.red('·'.repeat(right));
}

function buildIndexedSeparator(index: number, total: number): string {
    const visibleLabel = ` ${index}/${total} `;
    const styledLabel = '  ' + pc.bgWhite(pc.black(pc.bold(visibleLabel))) + '  ';
    const visibleWidth = visibleLabel.length + 4;
    const width = process.stdout.columns ?? 80;
    const dotCount = Math.max(0, width - visibleWidth);
    return pc.dim('·'.repeat(dotCount)) + styledLabel;
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
 * O(n) — iterates failures once and pushes into an existing bucket rather than
 * creating a new spread array on every iteration (avoids O(n²) allocations).
 * `path.relative` is applied once per failure to avoid repeated computation
 * inside the render loop.
 */
function groupFailuresByFile(
    failures: readonly RuleFailure[],
    cwd: string,
): Map<string, RuleFailure[]> {
    const map = new Map<string, RuleFailure[]>();
    for (const failure of failures) {
        const relativePath = path.relative(cwd, failure.filePath);
        const existing = map.get(relativePath);
        if (existing) {
            existing.push(failure);
        } else {
            map.set(relativePath, [failure]);
        }
    }
    return map;
}

/** Returns a new array of failures sorted by source position. */
function sortedByPosition(failures: RuleFailure[]): RuleFailure[] {
    return [...failures].sort(compareByPosition);
}

/**
 * Computes the maximum display width of any `"line:col"` location string
 * in the set, used to left-pad all locations to a consistent column width.
 */
function computeLocationWidth(failures: RuleFailure[]): number {
    return failures.reduce((max, failure) => Math.max(max, `${failure.line}:${failure.column}`.length), 0);
}

function buildSummaryLine(errorCount: number, warningCount: number, stats?: ResultSummary): string {
    const total = errorCount + warningCount;
    const status = stats
        ? getAnalysisStatus(stats)
        : (errorCount > 0
            ? { status: 'failed' as const, label: 'FAILED' as const }
            : { status: 'passed-with-warnings' as const, label: 'WARN' as const });

    const failed = status.status === 'failed';
    const statusColor = failed ? pc.red : pc.yellow;
    const statusIcon = failed ? '×' : '!';
    const statusLabel = statusColor(pc.bold(status.label));
    const errorText = pc.red(`${errorCount} error${errorCount !== 1 ? 's' : ''}`);
    const warningText = pc.yellow(`${warningCount} warning${warningCount !== 1 ? 's' : ''}`);

    return (
        `${statusColor(statusIcon)} `
        + `${total} violation${total !== 1 ? 's' : ''} `
        + `(${errorText}, ${warningText})  `
        + statusLabel
    );
}

function buildProblemNextAction(): string {
    return pc.dim('Run `ngcompass analyze --format html` for a full report.');
}

function formatDuration(ms: number): string {
    if (ms < 1000) return `${Math.round(ms)}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
}

function buildAnalysisSummary(stats: ResultSummary): string {
    const files = stats.discoveredFiles ?? stats.scannedFiles ?? stats.totalFiles;

    if (stats.totalTasks === 0 && stats.cachedTasks !== undefined) {
        return (
            `${files.toLocaleString()} files · ` +
            `${pc.dim('fully cached')} · ` +
            `${formatDuration(stats.duration)}`
        );
    }

    const checkLabel = stats.totalTasks === 1 ? 'check' : 'checks';
    const cached = stats.cachedTasks && stats.cachedTasks > 0
        ? `, ${stats.cachedTasks.toLocaleString()} cached`
        : '';

    return (
        `${files.toLocaleString()} files · ` +
        `${stats.totalTasks.toLocaleString()} ${checkLabel}${cached} · ` +
        `${formatDuration(stats.duration)}`
    );
}

function buildPassLine(): string {
    const status = getAnalysisStatus({ totalErrors: 0, totalWarnings: 0 });
    return `${pc.green('❯')} ${pc.green(pc.bold('No violations found'))} ${pc.dim('·')} ${pc.green(pc.bold(status.label))}`;
}

function formatStepMessage(message: string): string {
    if (message.startsWith('❯ ')) {
        return `${pc.cyan('❯')} ${pc.dim(message.slice(2))}`;
    }

    return pc.dim(message);
}

function formatInfoMessage(message: string): string {
    if (/^[❯✔✓√]\s/.test(message)) {
        return `${pc.green('❯')} ${pc.dim(message.slice(2))}`;
    }

    return pc.dim(message);
}
function guidanceForError(message: string): string | null {
    if (/No configuration found/i.test(message)) {
        return 'Run `ngcompass init` to create a starter configuration.';
    }

    if (/Configuration validation failed/i.test(message)) {
        return 'Run `ngcompass config health` for a focused configuration check.';
    }

    if (/File discovery failed/i.test(message)) {
        return 'Check your include/exclude globs and tsconfig parser options.';
    }

    if (/Rule resolution failed/i.test(message)) {
        return 'Check rule names, presets, and plugin configuration.';
    }

    return null;
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
    const type = isError ? 'error' : 'warn';
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

function buildCompactRecommendationLine(
    fix: string,
    locationWidth: number,
    typeWidth: number,
): string {
    const messageIndent = ' '.repeat(locationWidth + 2 + typeWidth + 2);
    return `${messageIndent}${pc.yellow('→')} ${pc.gray(fix)}`;
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
    return `${coloredMsg}  ${pc.dim(failure.ruleName)}`;
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
    private readonly compact: boolean;
    private readonly quiet: boolean;
    private readonly noRecommendation: boolean;
    private readonly sourceReader: SourceReader;
    private readonly cwd: string;
    private lastSummary?: ResultSummary;

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
        this.compact = options?.compact ?? false;
        this.quiet = options?.quiet ?? false;
        this.noRecommendation = options?.noRecommendation ?? false;
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
        const scannedFiles = this.lastSummary?.discoveredFiles ?? this.lastSummary?.scannedFiles ?? 0;

        if (allFailures.length === 0) {
            if (scannedFiles > 0) {
                this.out.write(`${pc.green('❯')} ${pc.bold(scannedFiles.toLocaleString() + ' files')}  ${pc.dim('no issues')}`);
            } else {
                this.out.write(pc.green('❯ No violations found'));
            }
            if (this.lastSummary) {
                this.out.write(buildPassLine());
            }
            return;
        }

        const byFile = groupFailuresByFile(allFailures, this.cwd);
        const sortedFilePaths = Array.from(byFile.keys()).sort();
        const { errorCount, warningCount } = countSeverities(allFailures);

        const cleanFiles = scannedFiles - byFile.size;
        if (cleanFiles > 0) {
            const violationPart = byFile.size > 0
                ? `  ${pc.red('✗')} ${pc.red(`${byFile.size.toLocaleString()} files with violations`)}`
                : '';
            this.out.write(`${pc.green('❯')} ${pc.bold(cleanFiles.toLocaleString() + ' files')}  ${pc.dim('no issues')}${violationPart}`);
        }

        this.out.write('');

        if (this.quiet) {
            this.out.write(pc.bold(buildSummaryLine(errorCount, warningCount, this.lastSummary)));
            this.out.write(buildProblemNextAction());
            return;
        }

        this.out.write(buildViolationsDivider());
        this.renderFileBlocks(byFile, sortedFilePaths, allFailures.length);
        this.out.write(pc.bold(buildSummaryLine(errorCount, warningCount, this.lastSummary)));
        this.out.write(buildProblemNextAction());
    }

    summary(stats: ResultSummary): void {
        this.lastSummary = stats;
        this.out.write(formatInfoMessage(`❯ ${buildAnalysisSummary(stats)}`));
    }

    error(error: Error): void {
        this.out.error(pc.red('× Analysis failed'));
        this.out.error(error.message);

        const guidance = guidanceForError(error.message);
        if (guidance) {
            this.out.error(pc.dim(guidance));
        }

    }

    step(message: string): void {
        this.out.write(formatStepMessage(message));
    }

    info(message: string): void {
        this.out.write(formatInfoMessage(message));
    }

    clearLine(): void {
        // Append-only output keeps the full progress log visible.
    }

    /**
     * No-op: debug logging is not handled by the reporter.
     */
    debug(_message: string): void {
        // no-op
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
        return results.flatMap(result => [...result.failures]);
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

        this.out.write(pc.underline(filePath));

        for (const failure of sorted) {
            this.out.write(buildCompactFailureLine(failure, locationWidth, TYPE_WIDTH_COMPACT));

            if (failure.fix && !this.noRecommendation) {
                this.out.write(buildCompactRecommendationLine(failure.fix, locationWidth, TYPE_WIDTH_COMPACT));
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

        for (let offset = 0; offset < sorted.length; offset++) {
            this.renderRichCard({
                failure: sorted[offset],
                index: startIndex + offset + 1,
                total,
                relFilePath: filePath,
                sourceLines,
            });
        }

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
        this.out.write(buildIndexedSeparator(card.index, card.total));
        this.out.write('');
        this.out.write(buildCardHeader(card.failure, card.relFilePath));
        this.out.write(buildCardMessageLine(card.failure));
        this.out.write(buildCardLocationLine(card.failure, card.relFilePath));
        this.out.write('');
        this.renderCardCodeFrame(card);
        this.out.write('');
        this.renderCardRecommendation(card.failure);

    }

    private renderCardCodeFrame({ sourceLines, failure }: FailureCard): void {
        if (sourceLines.length === 0) return;

        const frameLines = renderCodeFrame(sourceLines, failure.line, failure.column, failure.filePath);
        for (const line of frameLines) {
            this.out.write(line);
        }
    }

    private renderCardRecommendation(failure: RuleFailure): void {
        if (!failure.fix || this.noRecommendation) return;
        this.out.write(`${pc.gray('»')} ${pc.gray(failure.fix)}`);
        this.out.write('');
    }
}
