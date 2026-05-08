import process from 'node:process';
import pc from 'picocolors';
import { ConsoleReporter } from './reporters/console-reporter.js';
import { JsonReporter } from './reporters/json-reporter.js';
import { HtmlReporter } from './reporters/html-reporter.js';
import { SarifReporter } from './reporters/sarif-reporter.js';
import { TextConfigReporter } from './reporters/config.js';
import { TextCacheReporter } from './reporters/cache.js';
import { RulesReporter, type RulesReporterOptions } from './reporters/rules-reporter.js';
import type { Reporter, ConfigReporter, CacheReporter, ReporterFormat, ConsoleReporterOptions, ResultSummary, ParseError } from './types.js';
import type { RuleResult } from '@ngcompass/common';
import { getAnalysisStatus } from './analysis-status.js';

class CompoundReporter implements Reporter {
    private readonly progress: ConsoleReporter;
    private pendingResults?: ReadonlyArray<RuleResult>;

    constructor(
        private readonly inner: Reporter,
        options?: ConsoleReporterOptions,
    ) {
        const stderrOutput = {
            write: (line: string) => process.stderr.write(line + '\n'),
            error: (line: string) => process.stderr.write(line + '\n'),
        };
        this.progress = new ConsoleReporter(stderrOutput, {
            ...options,
            compact: false,
            phaseStream: process.stderr as NodeJS.WriteStream,
        });
    }

    report(results: ReadonlyArray<RuleResult>): void {
        this.inner.report(results);
        this.pendingResults = results;
    }

    parseErrors(errors: ReadonlyArray<ParseError>): void {
        if (errors.length > 0) this.progress.parseErrors(errors);
        this.inner.parseErrors(errors);
    }

    error(error: Error): void {
        this.progress.error(error);
    }

    summary(stats: ResultSummary): void {
        this.progress.summary(stats);
        this.inner.summary(stats);

        if (this.pendingResults) {
            const scannedFiles = stats.discoveredFiles ?? stats.scannedFiles ?? 0;
            if (scannedFiles > 0) {
                const filesWithViolations = new Set(
                    this.pendingResults.flatMap(r => r.failures.map(f => f.filePath)),
                ).size;
                const cleanFiles = scannedFiles - filesWithViolations;
                const violationPart = filesWithViolations > 0
                    ? `  ${pc.red('✗')} ${pc.red(`${filesWithViolations.toLocaleString()} files with violations`)}`
                    : '';
                process.stderr.write(
                    `${pc.green('❯')} ${pc.bold(cleanFiles.toLocaleString() + ' files')}  ${pc.dim('no issues')}${violationPart}\n`,
                );
            }

            const { totalErrors, totalWarnings } = stats;
            const total = totalErrors + totalWarnings;

            if (total > 0) {
                const { status, label } = getAnalysisStatus(stats);
                const failed = status === 'failed';
                const errorText = pc.red(`${totalErrors} error${totalErrors !== 1 ? 's' : ''}`);
                const warningText = pc.yellow(`${totalWarnings} warning${totalWarnings !== 1 ? 's' : ''}`);
                const icon = failed ? pc.red('×') : pc.yellow('!');
                const statusLabel = failed ? pc.bold(pc.red(label)) : pc.bold(pc.yellow(label));
                process.stderr.write(
                    `${icon} ${total} violation${total !== 1 ? 's' : ''} (${errorText}, ${warningText})  ${statusLabel}\n`,
                );
            } else {
                process.stderr.write(`${pc.green('❯')} ${pc.green('No violations found')}\n`);
            }

            this.pendingResults = undefined;
        }
    }

    step(message: string): void { this.progress.step(message); }
    info(message: string): void { this.progress.info(message); }
    debug(message: string): void { this.progress.debug(message); }
    clearLine(): void { this.progress.clearLine(); }
}

export function getReporter(
    format: ReporterFormat = 'console',
    options?: ConsoleReporterOptions,
): Reporter {
    switch (format) {
        case 'json':
            return new CompoundReporter(new JsonReporter(), options);
        case 'sarif':
            return new CompoundReporter(new SarifReporter(), options);
        case 'console':
            return new ConsoleReporter(undefined, options);
        case 'html':
        case 'ui':
            return new CompoundReporter(new HtmlReporter(options?.outputPath, undefined, true), options);
        default: {
            const exhaustive: never = format;
            throw new Error(`Unknown reporter format: "${exhaustive as string}"`);
        }
    }
}

export function getConfigReporter(): ConfigReporter {
    return new TextConfigReporter();
}

export function getCacheReporter(): CacheReporter {
    return new TextCacheReporter();
}

export function getRulesReporter(options?: RulesReporterOptions): RulesReporter {
    return new RulesReporter(options);
}
