import type { ReporterFormat, ConsoleReporterOptions, Reporter, ConfigReporter } from './types.js';
import { TextConfigReporter } from './reporters/config.js';
import { ConsoleReporter } from './reporters/console-reporter.js';
import { JsonReporter } from './reporters/json-reporter.js';

export function getConfigReporter(): ConfigReporter {
    return new TextConfigReporter();
}

export function getReporter(format: ReporterFormat = 'console', options?: ConsoleReporterOptions): Reporter {
    switch (format) {
        case 'json':
            return new JsonReporter();
        case 'console':
            return new ConsoleReporter(undefined, options);
    }
}
