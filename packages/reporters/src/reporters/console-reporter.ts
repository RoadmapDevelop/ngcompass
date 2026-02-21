import pc from 'picocolors';
import path from 'node:path';
import process from 'node:process';
import type {
    RuleFailure,
    RuleResult,
    ParseError,
    ConsoleReporterOptions,
    Reporter,
    ResultSummary,
} from '../types.js';
import type { ReporterOutput } from '../output.js';
import { processOutput } from '../output.js';
import { isErrorSeverity, compareByPosition } from '../severity-utils.js';
import { renderCodeFrame, defaultSourceReader, type SourceReader } from '../code-frame.js';

// ---------------------------------------------------------------------------
// Named constants — no magic numbers or inline literals
// ---------------------------------------------------------------------------

/** Column width reserved for the "error" label in compact mode (`'error'.length`). */
const TYPE_WIDTH_ERROR = 5;

/** Column width reserved for the "warning" label in compact mode (`'warning'.length`). */
const TYPE_WIDTH_WARNING = 7;

/** Fallback terminal width when stdout is not a TTY (e.g. piped output). */
const FALLBACK_TERMINAL_WIDTH = 80;

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

/** Returns the current terminal width, safe for use in piped environments. */
function terminalWidth(): number {
    return process.stdout.columns ?? FALLBACK_TERMINAL_WIDTH;
}

/** Full-width separator drawn between consecutive failure cards. */
function issueSeparator(): string {
    return pc.gray('─'.repeat(terminalWidth()));
}

/** Full-width dim separator drawn before the final summary line. */
function summaryDivider(): string {
    return pc.dim('─'.repeat(terminalWidth()));
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
    const colorFn = errorCount > 0 ? pc.red : pc.yellow;
    return (
        `${colorFn('×')} ${total} problem${total !== 1 ? 's' : ''} ` +
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
// Rich-mode pure formatter
// ---------------------------------------------------------------------------

/**
 * Builds the Biome-style issue header lines:
 *
 *   1  ██ ERROR ██  prefer-on-push
 *   --> src/app/app.component.ts:5:18
 *
 * Why a coloured background badge rather than text colour alone:
 * ensures readability in terminals where only background colour is supported.
 */
function buildIssueHeader(failure: RuleFailure, index: number, filePath: string): string[] {
    const isError = isErrorSeverity(failure.severity);
    const badge = isError
        ? pc.bgRed(pc.white(pc.bold(' ERROR ')))
        : pc.bgYellow(pc.black(pc.bold(' WARN  ')));

    const header = `${pc.bold(pc.white(String(index)))}  ${badge}  ${pc.dim(failure.ruleName)}`;
    const location = pc.gray(`--> ${filePath}:${failure.line}:${failure.column}`);
    return [header, location];
}

// ---------------------------------------------------------------------------
// Rich-mode failure card context DTO
// ---------------------------------------------------------------------------

/**
 * All data required to render a single failure card.
 *
 * Using a context DTO keeps `renderRichCard`'s signature at 1 argument and
 * makes future additions (e.g. a total-count pager) backward-compatible
 * without needing to change every call-site.
 */
interface FailureCard {
    readonly failure: RuleFailure;
    /** 1-based display index shown to the user. */
    readonly index: number;
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
        this.renderFileBlocks(byFile, sortedFilePaths);
        this.out.write(pc.bold(buildSummaryLine(errorCount, warningCount)));
    }

    summary(stats: ResultSummary): void {
        const cachedInfo = stats.cachedTasks ? ` (${stats.cachedTasks} cached)` : '';
        this.out.write(
            pc.gray(`Analyzed ${stats.totalFiles} file${stats.totalFiles !== 1 ? 's' : ''} · `) +
            pc.gray(`${stats.totalTasks} task${stats.totalTasks !== 1 ? 's' : ''}${cachedInfo} · `) +
            pc.gray(`${stats.duration.toFixed(0)}ms`),
        );
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
     */
    private renderFileBlocks(
        byFile: Map<string, RuleFailure[]>,
        sortedFilePaths: string[],
    ): void {
        if (this.compact) {
            this.renderCompactBlocks(byFile, sortedFilePaths);
            return;
        }

        this.renderRichBlocks(byFile, sortedFilePaths);
        this.out.write(summaryDivider());
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
    // Rich rendering — Biome-style (commands only — void return)
    // -------------------------------------------------------------------------

    private renderRichBlocks(
        byFile: Map<string, RuleFailure[]>,
        sortedFilePaths: string[],
    ): void {
        let globalIndex = 0;

        for (const filePath of sortedFilePaths) {
            const failures = byFile.get(filePath)!;
            globalIndex = this.renderRichFileBlock(filePath, failures, globalIndex);
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
    ): number {
        const sorted = sortedByPosition(failures);

        // Resolve source lines once per file — avoids repeated I/O per individual failure card.
        const sourceLines = this.sourceReader.readLines(sorted[0]?.filePath ?? '');

        sorted.forEach((failure, offset) => {
            this.renderRichCard({
                failure,
                index: startIndex + offset + 1,
                relFilePath: filePath,
                sourceLines,
            });
        });

        return startIndex + sorted.length;
    }

    /**
     * Renders one Biome-style failure card:
     *
     *   1  ██ ERROR ██  prefer-on-push
     *   --> src/app/app.component.ts:5:18
     *
     *   × Use OnPush change detection
     *
     *     3 │ ...
     *   > 5 │ ...
     *          ^^^^^^^^^
     *     6 │ ...
     *
     *   i Add changeDetection: ChangeDetectionStrategy.OnPush
     */
    private renderRichCard(card: FailureCard): void {
        // Separator appears before every card except the very first.
        if (card.index > 1) this.out.write(issueSeparator());

        this.renderCardHeader(card);
        this.out.write('');
        this.renderCardMessage(card.failure);
        this.out.write('');
        this.renderCardCodeFrame(card);
        this.out.write('');
        this.renderCardRecommendation(card.failure);
    }

    private renderCardHeader({ failure, index, relFilePath }: FailureCard): void {
        for (const line of buildIssueHeader(failure, index, relFilePath)) {
            this.out.write(line);
        }
    }

    private renderCardMessage(failure: RuleFailure): void {
        const isError = isErrorSeverity(failure.severity);
        const bullet = isError ? pc.red('×') : pc.yellow('!');
        this.out.write(`${bullet} ${pc.white(failure.message.replace(TRAILING_PERIOD_RE, ''))}`);
    }

    private renderCardCodeFrame({ sourceLines, failure }: FailureCard): void {
        // Skip silently when the source file could not be read (e.g. temp or deleted file).
        if (sourceLines.length === 0) return;

        const frameLines = renderCodeFrame(sourceLines, failure.line, failure.column);
        for (const line of frameLines) {
            this.out.write(line);
        }
    }

    private renderCardRecommendation(failure: RuleFailure): void {
        if (!failure.fix) return;
        this.out.write(`${pc.cyan('i')} ${pc.cyan(failure.fix)}`);
        this.out.write('');
    }
}
