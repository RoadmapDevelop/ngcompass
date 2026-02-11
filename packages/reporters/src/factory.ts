import { TextConfigReporter } from './reporters/config.js';
import { ConsoleReporter } from './reporters/console-reporter.js';
import type { ConfigReporter, Reporter } from './types.js';

export function getConfigReporter(format: string = 'text'): ConfigReporter {
    switch (format) {
        case 'text':
            return TextConfigReporter;
        default:
            // Fallback to text for now
            return TextConfigReporter;
    }
}

export function getReporter(format: string = 'console'): Reporter {
    switch (format) {
        case 'console':
            return new ConsoleReporter();
        default:
            return new ConsoleReporter();
    }
}
