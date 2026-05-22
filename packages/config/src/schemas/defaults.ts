/**
 * @fileoverview
 * Default configuration values and factory helpers for the ngcompass config package.
 *
 * This module exports the baseline settings for rule severe thresholds, reporting,
 * file glob inclusions/exclusions, cache options, and worker pool scaling, importing
 * core default patterns from the `@ngcompass/common` constants module.
 */

import type { OutputFormat, FailSeverity, CacheOptions } from '@ngcompass/common';
import { DEFAULT_INCLUDE_PATTERNS } from '@ngcompass/common';
import os from 'node:os';

/** Default on-disk cache directory used when no override is configured. */
const DEFAULT_CACHE_DIR = 'node_modules/.cache/ngcompass';

/** Default noisy/generated paths excluded before rule planning. */
const DEFAULT_EXCLUDE_PATTERNS = [
    '**/node_modules/**',
    '**/dist/**',
    '**/build/**',
    '**/*.spec.ts',
    '**/*.test.ts',
] as const;

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
 * process and caps the default for system responsiveness during heavy
 * analysis. Users can still opt into more parallelism with `maxWorkers`.
 *
 * @returns {number} The suggested number of CPU cores to utilize.
 */
export const getDefaultMaxWorkers = (): number => {
    const cpuCount = os.cpus().length;
    return Math.max(1, Math.min(4, cpuCount - 1));
};

/**
 * Standard configuration for the persistent caching layer.
 * These settings determine where analysis results are stored and 
 * how long they remain valid before expiration.
 */
export const DEFAULT_CACHE_OPTIONS: Required<CacheOptions> = {
    enabled: true,
    location: DEFAULT_CACHE_DIR,
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
    include: DEFAULT_INCLUDE_PATTERNS,
    exclude: DEFAULT_EXCLUDE_PATTERNS,
} as const;
