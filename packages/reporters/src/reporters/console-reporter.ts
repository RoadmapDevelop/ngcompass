import type { Reporter, ResultSummary } from '../types.js';
import type { RuleResult } from '@ngcompass/core';
import type { ReporterOutput } from '../output.js';
import { processOutput } from '../output.js';
import pc from 'picocolors';
import path from 'node:path';
import process from 'node:process';

/**
 * ConsoleReporter
 *
 * Produces ESLint-style human-readable terminal output.
 *
 * Output is injected via ReporterOutput so the reporter is fully
 * testable without mocking console globals:
 *
 * ```ts
 * const lines: string[] = [];
 * const out: ReporterOutput = { write: l => lines.push(l), error: l => lines.push(l) };
 * const reporter = new ConsoleReporter(out);
 * reporter.report(fixtures);
 * ```
 */
export class ConsoleReporter implements Reporter {
    constructor(private readonly out: ReporterOutput = processOutput) {}

    report(results: RuleResult[]): void {
        // Flatten all failures
        const allFailures = results.flatMap(r => r.failures);

        if (allFailures.length === 0) {
            this.out.write(pc.green('✔ No violations found!'));
            return;
        }

        // Group by relative file path
        const failuresByFile = new Map<string, typeof allFailures>();
        allFailures.forEach(failure => {
            const relativePath = path.relative(process.cwd(), failure.filePath);
            const current = failuresByFile.get(relativePath) || [];
            current.push(failure);
            failuresByFile.set(relativePath, current);
        });

        // Sort files alphabetically
        const sortedFiles = Array.from(failuresByFile.keys()).sort();

        let errorCount = 0;
        let warningCount = 0;

        this.out.write(''); // Initial spacer

        sortedFiles.forEach(filePath => {
            const failures = failuresByFile.get(filePath)!;

            // Sort by line then column
            failures.sort((a, b) => {
                if (a.line === b.line) return a.column - b.column;
                return a.line - b.line;
            });

            this.out.write(pc.underline(filePath));

            // Calculate alignment padding
            const maxLocationWidth = failures.reduce((max, f) => {
                const loc = `${f.line}:${f.column}`;
                return Math.max(max, loc.length);
            }, 0);

            const maxTypeWidth = failures.reduce((max, f) => {
                const isError = this.isError(f.severity as string);
                return Math.max(max, isError ? 5 : 7); // 'error'=5, 'warning'=7
            }, 0);

            failures.forEach(failure => {
                const isError = this.isError(failure.severity as string);
                if (isError) errorCount++;
                else warningCount++;

                const loc = `${failure.line}:${failure.column}`;
                const type = isError ? 'error' : 'warning';
                const colorFn = isError ? pc.red : pc.yellow;

                const locPadding = ' '.repeat(maxLocationWidth - loc.length);
                const typePadding = ' '.repeat(maxTypeWidth - type.length);

                this.out.write(
                    `  ${pc.gray(loc)}${locPadding}  ` +
                    `${colorFn(type)}${typePadding}  ` +
                    `${failure.message.replace(/\.$/, '')}  ` +
                    `${pc.gray(failure.ruleName)}`
                );
            });

            this.out.write(''); // Spacer between files
        });

        // Summary line
        const total = errorCount + warningCount;
        const color = errorCount > 0 ? pc.red : pc.yellow;
        const summary =
            `${color('✖')} ${total} problem${total !== 1 ? 's' : ''} ` +
            `(${errorCount} error${errorCount !== 1 ? 's' : ''}, ` +
            `${warningCount} warning${warningCount !== 1 ? 's' : ''})`;

        this.out.write(pc.bold(summary));
    }

    summary(stats: ResultSummary): void {
        const cachedInfo = stats.cachedTasks ? ` (${stats.cachedTasks} cached)` : '';
        this.out.write(pc.gray(`Analyzed ${stats.totalTasks} tasks${cachedInfo} in ${stats.duration.toFixed(0)}ms`));
    }

    error(error: Error): void {
        this.out.error(pc.red(`\nOops! Something went wrong! :(`));
        this.out.error(`\n${error.message}`);
        if (error.stack) {
            this.out.error(pc.gray(error.stack.split('\n').slice(1).join('\n')));
        }
    }

    private isError(severity: string): boolean {
        return severity === 'critical' || severity === 'high' || severity === 'error';
    }
}
