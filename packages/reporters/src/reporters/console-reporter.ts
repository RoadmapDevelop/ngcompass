import type { Reporter, ResultSummary } from '../types.js';
import type { RuleResult } from '@ngcompass/core';
import pc from 'picocolors';
import path from 'node:path';
import process from 'node:process';

export class ConsoleReporter implements Reporter {
    report(results: RuleResult[]): void {
        // Flatten all failures
        const allFailures = results.flatMap(r => r.failures);

        if (allFailures.length === 0) {
            console.log(pc.green('✔ No violations found!'));
            return;
        }

        // Group by file
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

        console.log(''); // Initial spacer

        sortedFiles.forEach(filePath => {
            const failures = failuresByFile.get(filePath)!;

            // Sort by line and column
            failures.sort((a, b) => {
                if (a.line === b.line) return a.column - b.column;
                return a.line - b.line;
            });

            console.log(pc.underline(filePath));

            // Calculate padding
            const maxLocationWidth = failures.reduce((max, f) => {
                const loc = `${f.line}:${f.column}`;
                return Math.max(max, loc.length);
            }, 0);

            const maxTypeWidth = failures.reduce((max, f) => {
                const isError = this.isError(f.severity as string);
                return Math.max(max, isError ? 5 : 7); // "error" is 5, "warning" is 7
            }, 0);

            failures.forEach(failure => {
                const isError = this.isError(failure.severity as string);
                if (isError) errorCount++;
                else warningCount++;

                const loc = `${failure.line}:${failure.column}`;
                const type = isError ? 'error' : 'warning';
                const colorFn = isError ? pc.red : pc.yellow;

                // Format:   line:col  type  message  ruleId
                const locPadding = ' '.repeat(maxLocationWidth - loc.length);
                const typePadding = ' '.repeat(maxTypeWidth - type.length);

                console.log(
                    `  ${pc.gray(loc)}${locPadding}  ` +
                    `${colorFn(type)}${typePadding}  ` +
                    `${failure.message.replace(/\.$/, '')}  ` + // Remove trailing dot for consistency
                    `${pc.gray(failure.ruleName)}`
                );
            });

            console.log(''); // Spacer between files
        });

        // Summary
        const total = errorCount + warningCount;
        const color = errorCount > 0 ? pc.red : pc.yellow;

        let summary = `${color('✖')} ${total} problem${total !== 1 ? 's' : ''} (${errorCount} error${errorCount !== 1 ? 's' : ''}, ${warningCount} warning${warningCount !== 1 ? 's' : ''})`;

        console.log(pc.bold(summary));
    }

    summary(stats: ResultSummary): void {
        // Optional: Can verify if we want to print additional execution stats 
        // similar to eslint's --print-config or timing, currently keeping it minimal 
        // or effectively merging it with the report summary if needed. 
        // For now, let's keep a cleaner version of the stats if requested.

        // If the main report already prints the error/warning count summary, 
        // this method might be redundant for that purpose, 
        // but it provides timing info which is useful.

        // We can just print the timing in a subtle way.
        console.log(pc.gray(`Parsed ${stats.totalTasks} files in ${stats.duration.toFixed(0)}ms`));
    }

    error(error: Error): void {
        console.error(pc.red(`\nOops! Something went wrong! :(`));
        console.error(`\n${error.message}`);
        if (error.stack) {
            console.error(pc.gray(error.stack.split('\n').slice(1).join('\n')));
        }
    }

    private isError(severity: string): boolean {
        return severity === 'critical' || severity === 'high' || severity === 'error';
    }
}
