/**
 * @fileoverview
 * Configuration-facing interfaces for the analyzer.
 *
 * Models the user-authored `AnalyzerConfig` shape, the normalized runtime
 * configuration consumed by downstream packages, plugin manifest metadata,
 * telemetry events, and validation reports. These contracts belong in
 * `common` because config, CLI, reporters, and engine all need the same
 * vocabulary without introducing cross-package dependencies.
 */

import type { Severity, RuleConfig } from './types.js';

// ============================================================
// PLUGIN MANIFEST
// ============================================================

/**
 * Optional manifest exported by external rule plugins.
 *
 * The plugin loader uses this to reject incompatible packages before rule
 * registration and to detect expensive capabilities such as type information
 * or template AST access.
 */
export interface PluginManifest {
    /** Package name, normally matching the plugin's npm package name. */
    readonly name: string;
    /** Plugin package version. */
    readonly version: string;
    /** Engine API version the plugin was built against. */
    readonly apiVersion: string;
    /** Semver range of `ngcompass` versions compatible with this plugin. */
    readonly engineVersionRange: string;
    /** Optional capability declarations used by routing and validation. */
    readonly capabilities?: {
        /** Plugin uses the TypeScript type-checker. */
        readonly requiresTypeInfo?: boolean;
        /** Plugin needs the parsed Angular template AST. */
        readonly requiresTemplateAST?: boolean;
        /** Plugin needs the parsed CSS/SCSS AST. */
        readonly requiresCssAST?: boolean;
    };
}

// ============================================================
// TELEMETRY CONFIGURATION
// ============================================================

/**
 * Minimal telemetry event shape shared by config and pipeline packages.
 */
export interface TelemetryEventBase {
    readonly phase: 'config' | 'planner' | 'engine';
    readonly operation: string;
    readonly durationMs: number;
    readonly cacheHit?: boolean;
    readonly workerId?: number;
    readonly metadata?: Readonly<Record<string, string | number | boolean>>;
}

/**
 * User-configurable telemetry sink.
 */
export interface TelemetryConfig {
    /** Whether telemetry collection is active. */
    enabled?: boolean;
    /** Synchronous callback invoked for every emitted telemetry event. */
    onEvent?: (event: TelemetryEventBase) => void;
}

/** Reporter output formats supported by the CLI. */
export type OutputFormat = 'json' | 'text' | 'sarif' | 'html';

/** Severity level that triggers a non-zero exit in CI/build. */
export type FailSeverity = Severity;

/**
 * TypeScript parser options accepted from user configuration.
 */
export interface ParserOptions {
    project?: string;
    tsconfigRootDir?: string;
    sourceType?: 'module' | 'commonjs';
    ecmaVersion?: number;
}

/**
 * Cache options after user config is parsed but before normalization.
 */
export interface CacheOptions {
    enabled?: boolean;
    location?: string;
    strategy?: 'memory' | 'local';
    ttl?: number;
}

/**
 * Rule overrides for a specific file set.
 */
export interface ConfigOverride {
    files: string | string[];
    rules?: Record<string, RuleConfig | Severity | 'off'>;
}

/**
 * Profile-specific configuration such as `dev` or `ci`.
 */
export type ProfileConfig = Partial<Omit<AnalyzerConfig, 'profiles'>>;

/**
 * User-authored analyzer configuration.
 *
 * This interface intentionally mirrors the public config file shape, so most
 * fields remain optional until the config package validates and normalizes
 * them into `NormalizedAnalyzerConfig`.
 */
export interface AnalyzerConfig {
    /** Preset names, npm package names, or paths to extend. */
    extends?: string | string[];

    /** File globs included in analysis. */
    include?: string[];

    /** File globs excluded from analysis. */
    exclude?: string[];

    /** Maximum number of worker threads for parallel analysis. */
    maxWorkers?: number;

    /** Cache toggle or cache configuration object. */
    cache?: boolean | CacheOptions;

    /** Reporter output format. */
    outputFormat?: OutputFormat;

    /** Optional output file path for machine-readable reports. */
    outputPath?: string;

    /** Severity level that causes a non-zero exit code. */
    failOnSeverity?: FailSeverity;

    /** Maximum warning count allowed before failing. */
    maxWarnings?: number;

    /** Additional ignore patterns applied during file discovery. */
    ignorePatterns?: string[];

    /** External rule plugins to load by package name or file path. */
    plugins?: string[];

    /** Rule configuration keyed by rule name. */
    rules?: Record<string, RuleConfig | Severity | 'off'>;

    /** Per-file rule overrides merged with global rule settings. */
    overrides?: ConfigOverride[];

    /** TypeScript parser configuration. */
    parserOptions?: ParserOptions;

    /** Environment-specific profile overrides. */
    profiles?: Record<string, ProfileConfig>;

    /** Structured telemetry collection settings. */
    telemetry?: TelemetryConfig;

    /** Engine execution thresholds for advanced tuning. */
    engine?: {
        /** Task count above which the worker pool is used. */
        parallelThreshold?: number;
    };
}

/**
 * One validation issue discovered while reading or normalizing config.
 */
export interface ConfigIssue {
    readonly code: string;
    readonly message: string;
    readonly path?: ReadonlyArray<string | number>;
    readonly severity: 'error' | 'warning';
    readonly file?: string;
    readonly line?: number;
    readonly column?: number;
    readonly suggestion?: string;
}

/**
 * Health report emitted by configuration validation.
 */
export interface HealthReport {
    valid: boolean;
    issues: ConfigIssue[];
    config?: unknown;
}

/** Configuration report alias used by reporter APIs. */
export type ConfigReport = HealthReport;

/**
 * Result of initializing a new configuration file.
 */
export interface InitResult {
    success: boolean;
    filePath: string;
    alreadyExists?: boolean;
}

/**
 * Fully-normalized analyzer configuration consumed by planner and engine.
 */
export interface NormalizedAnalyzerConfig extends Omit<AnalyzerConfig, 'cache' | 'maxWorkers' | 'outputFormat' | 'failOnSeverity' | 'maxWarnings' | 'rules'> {
    /** Cache configuration, guaranteed to be a full object. */
    cache: Required<CacheOptions>;

    /** Maximum number of worker threads. */
    maxWorkers: number;

    /** Reporting format. */
    outputFormat: OutputFormat;

    /** Severity level for non-zero exit code. */
    failOnSeverity: FailSeverity;

    /** Maximum allowed warnings. */
    maxWarnings: number;

    /** Resolved rule configuration keyed by rule name. */
    rules: Record<string, RuleConfig | Severity | 'off'>;
}

/**
 * Combined result of config normalization and validation reporting.
 */
export interface ConfigValidationResult {
    config?: NormalizedAnalyzerConfig;
    report: HealthReport;
}
