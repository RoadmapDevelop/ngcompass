import pc from 'picocolors';
import path from 'node:path';
import process from 'node:process';
import type { RuleFailure, RuleResult, RuleSeverity, ConsoleReporterOptions, Reporter, ResultSummary } from '../types.js';
import type { ReporterOutput } from '../output.js';
import { processOutput } from '../output.js';

function isErrorSeverity(severity: RuleSeverity): boolean {
    return severity === 'critical' || severity === 'high' || severity === 'error';
}

function groupFailuresByFile(failures: readonly RuleFailure[], cwd: string): Map<string, RuleFailure[]> {
    const map = new Map<string, RuleFailure[]>();
    for (const failure of failures) {
        const rel = path.relative(cwd, failure.filePath);
        const bucket = map.get(rel);
        if (bucket) {
            bucket.push(failure);
        } else {
            map.set(rel, [failure]);
        }
    }
    return map;
}

function sortByPosition(failures: RuleFailure[]): void {
    failures.sort((a, b) => a.line !== b.line ? a.line - b.line : a.column - b.column);
}

function buildFailureLine(
    failure: RuleFailure,
    locationWidth: number,
    typeWidth: number,
): string {
    const isError = isErrorSeverity(failure.severity);
    const loc = `${failure.line}:${failure.column}`;
    const type = isError ? 'error' : 'warning';
    const colorFn = isError ? pc.red : pc.yellow;
    const locPad = ' '.repeat(locationWidth - loc.length);
    const typePad = ' '.repeat(typeWidth - type.length);

    return (
        `${pc.gray(loc)}${locPad}  ` +
        `${colorFn(type)}${typePad}  ` +
        `${failure.message.replace(/\.$/, '')}  ` +
        `${pc.gray(failure.ruleName)}`
    );
}

function buildSummaryLine(errorCount: number, warningCount: number): string {
    const total = errorCount + warningCount;
    const color = errorCount > 0 ? pc.red : pc.yellow;
    return (
        `${color('✖')} ${total} problem${total !== 1 ? 's' : ''} ` +
        `(${errorCount} error${errorCount !== 1 ? 's' : ''}, ` +
        `${warningCount} warning${warningCount !== 1 ? 's' : ''})`
    );
}

export class ConsoleReporter implements Reporter {
    private readonly verbose: boolean;

    constructor(
        private readonly out: ReporterOutput = processOutput,
        options?: ConsoleReporterOptions,
    ) {
        this.verbose = options?.verbose ?? false;
    }

    report(results: RuleResult[]): void {
        const allFailures = results.flatMap(r => r.failures as RuleFailure[]);

        if (allFailures.length === 0) {
            this.out.write(pc.green('✔ No violations found!'));
            return;
        }

        const byFile = groupFailuresByFile(allFailures, process.cwd());
        const sortedFiles = Array.from(byFile.keys()).sort();

        let errorCount = 0;
        let warningCount = 0;

        this.out.write('');

        for (const filePath of sortedFiles) {
            const failures = byFile.get(filePath)!;
            sortByPosition(failures);

            const locationWidth = failures.reduce((max, f) => Math.max(max, `${f.line}:${f.column}`.length), 0);
            const typeWidth = failures.some(f => !isErrorSeverity(f.severity)) ? 7 : 5;

            this.out.write(pc.underline(filePath));

            for (const failure of failures) {
                if (isErrorSeverity(failure.severity)) {
                    errorCount++;
                } else {
                    warningCount++;
                }

                this.out.write(buildFailureLine(failure, locationWidth, typeWidth));

                if (this.verbose && failure.fix) {
                    this.out.write(`      ${pc.yellow('→')} ${pc.gray(failure.fix)}`);
                }
            }

            this.out.write('');
        }

        this.out.write(pc.bold(buildSummaryLine(errorCount, warningCount)));
    }

    summary(stats: ResultSummary): void {
        const cachedInfo = stats.cachedTasks ? ` (${stats.cachedTasks} cached)` : '';
        this.out.write(
            pc.gray(`Analyzed ${stats.totalFiles} file${stats.totalFiles !== 1 ? 's' : ''} · `) +
            pc.gray(`${stats.totalTasks} task${stats.totalTasks !== 1 ? 's' : ''}${cachedInfo} · `) +
            pc.gray(`${stats.duration.toFixed(0)}ms`)
        );
    }

    error(error: Error): void {
        this.out.error(pc.red('✗ Analysis failed'));
        this.out.error(error.message);
        if (error.stack) {
            this.out.error(pc.gray(error.stack.split('\n').slice(1).join('\n')));
        }
    }

    step(message: string): void {
        this.out.write(pc.bold(message));
    }

    info(message: string): void {
        this.out.write(pc.dim(message));
    }

    debug(message: string): void {
        if (process.env.DEBUG) {
            this.out.write(pc.gray(`[DEBUG] ${message}`));
        }
    }

    parseErrors(errors: { filePath: string; message: string }[]): void {
        if (errors.length > 0) {
            this.out.write(pc.red(`\nParse Errors (${errors.length}):`));
            for (const pe of errors) {
                this.out.write(pc.red(`  ${pe.filePath}: ${pe.message}`));
            }
        }
    }
}
