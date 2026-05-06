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

/**
 * Wraps a file/structured reporter (HTML, JSON, SARIF) and forwards all progress
 * methods to a ConsoleReporter that writes to stderr.
 *
 * This ensures step/info/summary messages always appear in the terminal regardless
 * of the output format. Stderr is used so that structured stdout (JSON, SARIF) is
 * never polluted.
 */
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
                    this.pendingResults.flatMap(r => r.failures.map(f => f.filePath))
                ).size;
                const cleanFiles = scannedFiles - filesWithViolations;
                const violationPart = filesWithViolations > 0
                    ? `  ${pc.red('✗')} ${pc.red(`${filesWithViolations.toLocaleString()} files with violations`)}`
                    : '';
                process.stderr.write(
                    `${pc.green('❯')} ${pc.bold(cleanFiles.toLocaleString() + ' files')}  ${pc.dim('no issues')}${violationPart}\n`
                );
            }
            this.pendingResults = undefined;
        }
    }

    step(message: string): void { this.progress.step(message); }
    info(message: string): void { this.progress.info(message); }
    debug(message: string): void { this.progress.debug(message); }
    clearLine(): void { this.progress.clearLine(); }
}

/**
 * Creates an analysis reporter instance based on the requested format.
 *
 * @param format - Output format. Defaults to `'console'`.
 * @param options - Console-specific rendering options (verbose, compact).
 * @returns A reporter implementing the full `Reporter` contract.
 * @throws {Error} When an unrecognised format string is provided.
 *
 * Why throw on unknown format rather than silently falling through to a default:
 * an unknown format is almost certainly a caller bug. Silent fallback would hide the
 * misconfiguration and produce unexpectedly formatted output (Principle of Least Astonishment).
 */
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
            // TypeScript narrows `format` to `never` here if `ReporterFormat` is exhaustive.
            // The cast exists so we can emit a clear runtime message if called from JS or
            // with a value that bypasses the type system (e.g., CLI flag parsing).
            const exhaustive: never = format;
            throw new Error(`Unknown reporter format: "${exhaustive as string}"`);
        }
    }
}

/**
 * Creates a configuration reporter instance.
 *
 * Used for config-specific commands like `compass config health` or `compass init`.
 *
 * @returns A reporter implementing the `ConfigReporter` contract.
 */
export function getConfigReporter(): ConfigReporter {
    return new TextConfigReporter();
}

/**
 * Creates a cache reporter instance.
 *
 * Used for cache-specific commands like `compass cache info` and `compass cache clear`.
 *
 * @returns A reporter implementing the `CacheReporter` contract.
 */
export function getCacheReporter(): CacheReporter {
    return new TextCacheReporter();
}

/**
 * Creates a rules reporter instance.
 *
 * Used by `compass rules` to render the rule list to stdout.
 */
export function getRulesReporter(options?: RulesReporterOptions): RulesReporter {
    return new RulesReporter(options);
}
