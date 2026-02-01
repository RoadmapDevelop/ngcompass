import { TextConfigReporter } from './reporters/config.js';
import type { ConfigReporter } from './types.js';

export function getConfigReporter(format: string = 'text'): ConfigReporter {
    switch (format) {
        case 'text':
            return TextConfigReporter;
        default:
            // Fallback to text for now
            return TextConfigReporter;
    }
}
