/**
 * @fileoverview
 * Public entry point for `@ngcompass/common`.
 *
 * Re-exports the shared domain types, interfaces, errors, logger, and
 * serialization helpers consumed by every other package in the monorepo.
 * This barrel is intentionally dependency-light because `common` sits at
 * the innermost architecture layer and must never import sibling packages.
 *
 * Every re-export uses the explicit `.js` extension required by
 * `module: "Node16"` so the package builds the same way for both
 * CommonJS and ESM consumers.
 */

export * from './constants.js';
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
    ProfileConfig,
    TelemetryConfig,
    TelemetryEventBase,
    ConfigOverride,
    ParserOptions,
} from './interfaces.js';
export * from './errors.js';
export * from './types.js';
export * from './ast/utils.js';
export * from './logger.js';
export * from './utils/stable-serialize.js';
export * from './utils/locator.js';
