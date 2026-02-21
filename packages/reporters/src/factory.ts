import { ConsoleReporter } from './reporters/console-reporter.js';
import { JsonReporter } from './reporters/json-reporter.js';
import { TextConfigReporter } from './reporters/config.js';
import type { Reporter, ConfigReporter, ReporterFormat, ConsoleReporterOptions } from './types.js';

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
            return new JsonReporter();
        case 'console':
            return new ConsoleReporter(undefined, options);
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
