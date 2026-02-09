import { Severity } from './types.js';

/**
 * Rule configuration with severity and options
 */
export interface RuleConfig {
    severity: Severity | 'off';
    options?: Record<string, unknown>;
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
}

/**
 * Structured configuration issue
 */
export interface ConfigIssue {
    code: string;
    message: string;
    path?: (string | number)[];
    severity: 'error' | 'warning';
    file?: string;
    line?: number;
    column?: number;
    suggestion?: string;
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

export interface NormalizedAnalyzerConfig extends Omit<AnalyzerConfig, 'cache' | 'maxWorkers' | 'outputFormat' | 'failOnSeverity' | 'maxWarnings' | 'reportUnusedDisableDirectives' | 'rules'> {
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
    rules: Record<string, unknown>;
}


export interface ConfigValidationResult {
    config?: NormalizedAnalyzerConfig;
    report: HealthReport;
}
