/**
 * @fileoverview
 * Public entry point for `@ngcompass/common`.
 *
 * Re-exports the shared domain types, interfaces, errors, logger, and
 * serialization helpers consumed by every other package in the monorepo.
 * This barrel is intentionally dependency-light because `common` sits at
 * the innermost architecture layer and must never import sibling packages.
 */

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
    ConfigOverride,
    ParserOptions,
} from './interfaces.js';
export * from './errors';
export * from './types';
export * from './ast/utils';
export * from './logger';
export * from './utils/stable-serialize';
export * from './utils/locator';
