import path from 'node:path';
import process from 'node:process';
import { RuleFailure, RuleResult, formatDuration } from '@ngcompass/common';
import pc from 'picocolors';
import { getAnalysisStatus } from '../analysis-status.js';
import {
  defaultSourceReader,
  renderCodeFrame,
  
} from '../code-frame.js';
import type { SourceReader } from '../models/index.js';
import { processOutput } from '../output.js';
import type { ReporterOutput } from '../models/index.js';
import { compareByPosition, isErrorSeverity } from '../severity-utils.js';
import type {
  ConsoleReporterOptions,
  ParseError,
  Reporter,
  ResultSummary,
} from '../models/index.js';

const TYPE_WIDTH_COMPACT = 5;

const TRAILING_PERIOD_RE = /\.$/;

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

interface SeverityCounts {
  readonly errorCount: number;
  readonly warningCount: number;
}

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

function groupFailuresByFile(
  failures: readonly RuleFailure[],
  cwd: string
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

function sortedByPosition(failures: RuleFailure[]): RuleFailure[] {
  return [...failures].sort(compareByPosition);
}

function computeLocationWidth(failures: RuleFailure[]): number {
  return failures.reduce(
    (max, failure) => Math.max(max, `${failure.line}:${failure.column}`.length),
    0
  );
}

function buildSummaryLine(
  errorCount: number,
  warningCount: number,
  stats?: ResultSummary
): string {
  const total = errorCount + warningCount;
  const status = stats
    ? getAnalysisStatus(stats)
    : errorCount > 0
      ? { status: 'failed' as const, label: 'FAILED' as const }
      : { status: 'passed-with-warnings' as const, label: 'WARN' as const };

  const failed = status.status === 'failed';
  const statusColor = failed ? pc.red : pc.yellow;
  const statusIcon = failed ? '×' : '!';
  const statusLabel = statusColor(pc.bold(status.label));
  const errorText = pc.red(`${errorCount} error${errorCount !== 1 ? 's' : ''}`);
  const warningText = pc.yellow(
    `${warningCount} warning${warningCount !== 1 ? 's' : ''}`
  );

  return (
    `${statusColor(statusIcon)} ` +
    `${total} violation${total !== 1 ? 's' : ''} ` +
    `(${errorText}, ${warningText})  ` +
    statusLabel
  );
}

function buildProblemNextAction(): string {
  return pc.dim('Run `ngcompass analyze --format html` for a full report.');
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
  const cached =
    stats.cachedTasks && stats.cachedTasks > 0
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

function buildCompactFailureLine(
  failure: RuleFailure,
  locationWidth: number,
  typeWidth: number
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
  typeWidth: number
): string {
  const messageIndent = ' '.repeat(locationWidth + 2 + typeWidth + 2);
  return `${messageIndent}${pc.yellow('→')} ${pc.gray(fix)}`;
}

function buildCardHeader(failure: RuleFailure, filePath: string): string {
  const isError = isErrorSeverity(failure.severity);
  const badge = isError
    ? pc.bgRed(pc.white(pc.bold(' FAIL ')))
    : pc.bgYellow(pc.white(pc.bold(' WARN ')));

  return `${badge} ${filePath}`;
}

function buildCardMessageLine(failure: RuleFailure): string {
  const isError = isErrorSeverity(failure.severity);
  const message = failure.message.replace(TRAILING_PERIOD_RE, '');
  const coloredMsg = isError ? pc.red(message) : pc.yellow(message);
  return `${coloredMsg}  ${pc.dim(failure.ruleName)}`;
}

function buildCardLocationLine(failure: RuleFailure, filePath: string): string {
  const loc = pc.cyan(`${filePath}:${failure.line}:${failure.column}`);
  return `${pc.cyan('❯')} ${loc}`;
}

interface FailureCard {
  readonly failure: RuleFailure;

  readonly index: number;

  readonly total: number;

  readonly relFilePath: string;

  readonly sourceLines: string[];
}

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

    sourceReader: SourceReader = defaultSourceReader,

    cwd: string = process.cwd()
  ) {
    this.compact = options?.compact ?? false;
    this.quiet = options?.quiet ?? false;
    this.noRecommendation = options?.noRecommendation ?? false;
    this.sourceReader = sourceReader;
    this.cwd = cwd;
  }

  report(results: ReadonlyArray<RuleResult>): void {
    const allFailures = this.extractAllFailures(results);
    const scannedFiles =
      this.lastSummary?.discoveredFiles ?? this.lastSummary?.scannedFiles ?? 0;
    const skippedFiles = this.lastSummary?.skippedFiles ?? 0;
    const skippedPart =
      skippedFiles > 0
        ? `  ${pc.yellow('⊘')} ${pc.yellow(`${skippedFiles.toLocaleString()} files skipped`)}`
        : '';

    if (allFailures.length === 0) {
      if (scannedFiles > 0) {
        const cleanFiles = scannedFiles - skippedFiles;
        this.out.write(
          `${pc.green('❯')} ${pc.bold(cleanFiles.toLocaleString() + ' files')}  ${pc.dim('no issues')}${skippedPart}`
        );
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

    const cleanFiles = scannedFiles - byFile.size - skippedFiles;
    if (cleanFiles > 0) {
      const violationPart =
        byFile.size > 0
          ? `  ${pc.red('✗')} ${pc.red(`${byFile.size.toLocaleString()} files with violations`)}`
          : '';
      this.out.write(
        `${pc.green('❯')} ${pc.bold(cleanFiles.toLocaleString() + ' files')}  ${pc.dim('no issues')}${violationPart}${skippedPart}`
      );
    }

    this.out.write('');

    if (this.quiet) {
      this.out.write(
        pc.bold(buildSummaryLine(errorCount, warningCount, this.lastSummary))
      );
      this.out.write(buildProblemNextAction());
      return;
    }

    this.out.write(buildViolationsDivider());
    this.renderFileBlocks(byFile, sortedFilePaths, allFailures.length);
    this.out.write(
      pc.bold(buildSummaryLine(errorCount, warningCount, this.lastSummary))
    );
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

  clearLine(): void {}

  debug(_message: string): void {}

  parseErrors(errors: ReadonlyArray<ParseError>): void {
    if (errors.length === 0) return;
    this.out.write(pc.red(`\nParse Errors (${errors.length}):`));
    for (const parseError of errors) {
      this.out.write(pc.red(`  ${parseError.filePath}: ${parseError.message}`));
    }
  }

  private extractAllFailures(
    results: ReadonlyArray<RuleResult>
  ): RuleFailure[] {
    return results.flatMap((result) => [...result.failures]);
  }

  private renderFileBlocks(
    byFile: Map<string, RuleFailure[]>,
    sortedFilePaths: string[],
    total: number
  ): void {
    if (this.compact) {
      this.renderCompactBlocks(byFile, sortedFilePaths);
      return;
    }

    this.renderRichBlocks(byFile, sortedFilePaths, total);
  }

  private renderCompactBlocks(
    byFile: Map<string, RuleFailure[]>,
    sortedFilePaths: string[]
  ): void {
    for (const filePath of sortedFilePaths) {
      this.renderCompactFileBlock(filePath, byFile.get(filePath)!);
    }
  }

  private renderCompactFileBlock(
    filePath: string,
    failures: RuleFailure[]
  ): void {
    const sorted = sortedByPosition(failures);
    const locationWidth = computeLocationWidth(sorted);

    this.out.write(pc.underline(filePath));

    for (const failure of sorted) {
      this.out.write(
        buildCompactFailureLine(failure, locationWidth, TYPE_WIDTH_COMPACT)
      );

      if (failure.fix && !this.noRecommendation) {
        this.out.write(
          buildCompactRecommendationLine(
            failure.fix,
            locationWidth,
            TYPE_WIDTH_COMPACT
          )
        );
      }
    }

    this.out.write('');
  }

  private renderRichBlocks(
    byFile: Map<string, RuleFailure[]>,
    sortedFilePaths: string[],
    total: number
  ): void {
    let globalIndex = 0;

    for (const filePath of sortedFilePaths) {
      const failures = byFile.get(filePath)!;
      globalIndex = this.renderRichFileBlock(
        filePath,
        failures,
        globalIndex,
        total
      );
    }
  }

  private renderRichFileBlock(
    filePath: string,
    failures: RuleFailure[],
    startIndex: number,
    total: number
  ): number {
    const sorted = sortedByPosition(failures);

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

    const frameLines = renderCodeFrame(
      sourceLines,
      failure.line,
      failure.column,
      failure.filePath
    );
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
