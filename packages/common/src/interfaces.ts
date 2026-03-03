import { Severity } from './types.js';
import type { RuleConfig } from './types.js';

// ============================================================
// PLUGIN MANIFEST (RFC §7.6)
// ============================================================

/**
 * Optional manifest that a plugin can export alongside its rules.
 *
 * When present the engine validates:
 *  - That the current tool version satisfies engineVersionRange
 *  - That required capabilities (typeInfo, templateAST) are available
 *
 * Plugins without a manifest are loaded with a deprecation warning.
 * Enforcement (hard error on missing manifest) is reserved for the next major.
 */
export interface PluginManifest {
    /** Package name (must match the plugin's npm package name) */
    readonly name: string;
    /** Plugin semver version (e.g. "2.1.0") */
    readonly version: string;
    /** Engine API semver version this plugin was built against */
    readonly apiVersion: string;
    /**
     * Semver range of ngcompass versions this plugin is compatible with.
     * Examples: ">=1.0.0 <2.0.0",  "^1.2.0",  "*"
     */
    readonly engineVersionRange: string;
    /** Optional capability declarations */
    readonly capabilities?: {
        /** Plugin uses the TypeScript type-checker (expensive) */
        readonly requiresTypeInfo?: boolean;
        /** Plugin needs the full HTML template AST */
        readonly requiresTemplateAST?: boolean;
        /** Plugin needs the CSS/SCSS AST */
        readonly requiresCssAST?: boolean;
    };
}

// ============================================================
// TELEMETRY CONFIGURATION (RFC §7.7)
// ============================================================

/** Minimal telemetry event shape used in config (avoids circular dep with core) */
export interface TelemetryEventBase {
    readonly phase: 'config' | 'planner' | 'engine';
    readonly operation: string;
    readonly durationMs: number;
    readonly cacheHit?: boolean;
    readonly workerId?: number;
    readonly metadata?: Readonly<Record<string, string | number | boolean>>;
}

export interface TelemetryConfig {
    /** Whether telemetry collection is active (default: false) */
    enabled?: boolean;
    /**
     * Called synchronously for every emitted event.
     * Use this to pipe events to a file, stdout, or an external collector.
     */
    onEvent?: (event: TelemetryEventBase) => void;
}



/**
 * Reporting output formats
 */
export type OutputFormat = 'json' | 'text' | 'sarif' | 'html';

/**
 * Severity level that triggers failure in CI/build
 */
export type FailSeverity = Severity;

/**
 * TypeScript parser options
 */
export interface ParserOptions {
    project?: string;
    tsconfigRootDir?: string;
    sourceType?: 'module' | 'commonjs';
    ecmaVersion?: number;
}

/**
 * File watcher options for watch mode
 */
export interface WatchOptions {
    debounce?: number;
    ignored?: string[];
}

/**
 * Cache configuration options
 */
export interface CacheOptions {
    enabled?: boolean;
    location?: string;
    strategy?: 'memory' | 'local';
    ttl?: number;
}

/**
 * Configuration override for specific files
 * Rules in overrides are merged with global rules
 */
export interface ConfigOverride {
    files: string | string[];
    rules?: Record<string, RuleConfig | Severity | 'off'>;
}

/**
 * Profile-specific configuration (dev/ci)
 * Profiles can override most settings except nested profiles
 */
export interface ProfileConfig extends Partial<Omit<AnalyzerConfig, 'profiles'>> { }

/**
 * Main analyzer configuration interface
 * Supports extends, rules, overrides, profiles, and more
 */
export interface AnalyzerConfig {
    /**
     * Extend from other configuration presets
     */
    extends?: string | string[];

    /**
     * Files to include in analysis
     */
    include?: string[];

    /**
     * Files to exclude from analysis
     */
    exclude?: string[];

    /**
     * Maximum number of worker threads for parallel analysis
     */
    maxWorkers?: number;

    /**
     * Cache configuration
     */
    cache?: boolean | CacheOptions;

    /**
     * Enable watch mode
     */
    watch?: boolean;

    /**
     * Watch mode options
     */
    watchOptions?: WatchOptions;

    /**
     * Enable auto-fixing violations
     */
    autoFix?: boolean;

    /**
     * Enable auto-fix on file save
     */
    autoFixOnSave?: boolean;

    /**
     * Output format for reports
     */
    outputFormat?: OutputFormat;

    /**
     * Output file path for report
     */
    outputPath?: string;

    /**
     * Severity level that causes non-zero exit code
     */
    failOnSeverity?: FailSeverity;

    /**
     * Maximum number of violations allowed before failing
     */
    maxWarnings?: number;

    /**
     * Report unused analyzer-disable directives
     */
    reportUnusedDisableDirectives?: boolean;

    /**
     * Additional patterns to ignore
     */
    ignorePatterns?: string[];

    /**
     * External rule plugins to load.
     * Each entry is a package name or file path that exports a RulePlugin or RulePlugin[].
     * Example: ['@my-org/ngcompass-rules', './tools/local-rules']
     */
    plugins?: string[];

    /**
     * Rule configuration
     */
    rules?: Record<string, RuleConfig | Severity | 'off'>;

    /**
     * Per-file rule overrides
     */
    overrides?: ConfigOverride[];

    /**
     * TypeScript parser configuration
     */
    parserOptions?: ParserOptions;

    /**
     * Environment-specific profiles
     */
    profiles?: Record<string, ProfileConfig>;

    /**
     * When true, any unrecoverable infrastructure error (worker crash,
     * cache corruption, serialization failure) causes a non-zero exit code
     * even if partial results were produced.
     *
     * Recommended for CI pipelines that require full correctness guarantees.
     * Default: false (recoverable errors are logged but do not fail the run).
     */
    failOnInfrastructureError?: boolean;

    /**
     * Structured telemetry collection.
     * Disabled by default — enabling it adds a small per-event overhead.
     */
    telemetry?: TelemetryConfig;

    /**
     * Engine execution thresholds.
     * Override the built-in defaults for parallelism decisions.
     */
    engine?: {
        /**
         * Number of tasks above which the worker pool is used instead of
         * local pLimit execution.  Default: 150.
         */
        parallelThreshold?: number;
    };
}

/**
 * Structured configuration issue
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
 * Health report for configuration validation
 */
export interface HealthReport {
    valid: boolean;
    issues: ConfigIssue[];
    config?: any;
}

/**
 * Configuration Report (alias for HealthReport)
 */
export type ConfigReport = HealthReport;

/**
 * Result of the configuration initialization
 */
export interface InitResult {
    success: boolean;
    filePath: string;
    alreadyExists?: boolean;
}

export interface NormalizedAnalyzerConfig extends Omit<AnalyzerConfig, 'cache' | 'maxWorkers' | 'outputFormat' | 'failOnSeverity' | 'maxWarnings' | 'reportUnusedDisableDirectives' | 'rules' | 'failOnInfrastructureError'> {
    /**
     * Cache configuration.
     * Guaranteed to be a full object, never boolean.
     */
    cache: Required<CacheOptions>;

    /**
     * Maximum number of worker threads.
     * Defaults to (CPUs - 1) or 1.
     */
    maxWorkers: number;

    /**
     * Reporting format.
     */
    outputFormat: OutputFormat;

    /**
     * Severity level for non-zero exit code.
     */
    failOnSeverity: FailSeverity;

    /**
     * Max allowed warnings.
     */
    maxWarnings: number;

    /**
     * Report unused directives.
     */
    reportUnusedDisableDirectives: boolean;

    /**
     * Resolved rule configuration.
     */
    rules: Record<string, RuleConfig | Severity | 'off'>;

    /**
     * Guaranteed to be a boolean after normalization. Default: false.
     */
    failOnInfrastructureError: boolean;
}


export interface ConfigValidationResult {
    config?: NormalizedAnalyzerConfig;
    report: HealthReport;
}
