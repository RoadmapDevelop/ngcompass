import type { OutputFormat, FailSeverity, CacheOptions } from '@ngcompass/common';
import os from 'node:os';

/**
 * Time-based constants in milliseconds for configuration durations.
 */
const TIME = {
    ONE_HOUR: 3600000,
    TWENTY_FOUR_HOURS: 86400000
} as const;

/**
 * Calculates the recommended default number of worker threads based on 
 * the host's hardware. It reserves at least one core for the main 
 * process to ensure system responsiveness during heavy analysis.
 *
 * @returns {number} The suggested number of CPU cores to utilize.
 */
export const getDefaultMaxWorkers = (): number => {
    const cpuCount = os.cpus().length;
    return Math.max(1, cpuCount - 1);
};

/**
 * Standard configuration for the persistent caching layer.
 * These settings determine where analysis results are stored and 
 * how long they remain valid before expiration.
 */
export const DEFAULT_CACHE_OPTIONS: Required<CacheOptions> = {
    enabled: true,
    location: 'node_modules/.cache/ngcompass',
    strategy: 'local',
    ttl: TIME.TWENTY_FOUR_HOURS,
};

/**
 * Default global configuration values for the ngcompass engine.
 * These values are used as the baseline when a user-provided 
 * configuration is missing specific keys.
 */
export const DEFAULT_CONFIG = {
    outputFormat: 'text' as OutputFormat,
    failOnSeverity: 'error' as FailSeverity,
    maxWarnings: 10,
    include: ['src/**/*.ts'],
    exclude: [
        'node_modules/**',
        'dist/**',
        '**/*.spec.ts',
        '**/*.test.ts'
    ],
} as const;
