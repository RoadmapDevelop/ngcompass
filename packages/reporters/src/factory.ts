import { TextConfigReporter } from './reporters/config.js';
import { ConsoleReporter } from './reporters/console-reporter.js';
import { JsonReporter } from './reporters/json-reporter.js';
import type { ConfigReporter, Reporter } from './types.js';

export function getConfigReporter(format: string = 'text'): ConfigReporter {
    switch (format) {
        case 'text':
            return TextConfigReporter;
        default:
            return TextConfigReporter;
    }
}

/**
 * Returns the appropriate Reporter for the given format string.
 *
 * Supported formats:
 *  - 'console' (default) — human-readable terminal output (ESLint-style)
 *  - 'json'              — ESLint-compatible JSON (for CI tools, Reviewdog, etc.)
 *
 * Usage via CLI:
 *   compass analyze --format json
 */
export function getReporter(format: string = 'console'): Reporter {
    switch (format) {
        case 'json':
            return new JsonReporter();
        case 'console':
        default:
            return new ConsoleReporter();
    }
}
