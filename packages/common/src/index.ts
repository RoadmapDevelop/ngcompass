/**
 * @angular-analyzer/common
 *
 * Common types, interfaces, and utilities shared across all packages
 */

// Core types
export * from './constants';
export {
    InitResult,
    NormalizedAnalyzerConfig,
    ConfigValidationResult,
    ConfigReport,
    CacheOptions,
    FailSeverity,
    OutputFormat,
    ConfigIssue,
    HealthReport,
    AnalyzerConfig,
    PluginManifest,
    TelemetryConfig,
    TelemetryEventBase,
} from './interfaces.js';
export * from './errors';
export * from './types';
export * from './ast/utils';
export * from './logger';
export * from './utils/stable-serialize';
export * from './utils/locator';
