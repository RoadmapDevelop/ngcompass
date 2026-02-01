import type { OutputFormat, FailSeverity, CacheOptions } from '@ngcompass/common';
import os from 'node:os';

/**
 * default CPU calculation for maxWorkers
 */
export const getDefaultMaxWorkers = (): number => Math.max(1, os.cpus().length - 1);

/**
 * Default cache settings
 */
export const DEFAULT_CACHE_OPTIONS: Required<CacheOptions> = {
    enabled: true,
    location: 'node_modules/.cache/ngcompass',
    strategy: 'local',
    ttl: 0, // 0 = default (usually handled by driver, e.g. 24h)
};

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG = {
    outputFormat: 'text' as OutputFormat,
    failOnSeverity: 'high' as FailSeverity,
    maxWarnings: 10,
    reportUnusedDisableDirectives: true,
    include: ['src/**/*.ts'],
    exclude: ['node_modules/**', 'dist/**', '**/*.spec.ts', '**/*.test.ts'],
};
