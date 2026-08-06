import type { Severity, RuleConfig } from './types.js';

export interface PluginManifest {
  readonly name: string;

  readonly version: string;

  readonly apiVersion: string;

  readonly engineVersionRange: string;

  readonly capabilities?: {
    readonly requiresTypeInfo?: boolean;

    readonly requiresTemplateAST?: boolean;

    readonly requiresCssAST?: boolean;
  };
}

export interface TelemetryEventBase {
  readonly phase: 'config' | 'planner' | 'engine';
  readonly operation: string;
  readonly durationMs: number;
  readonly cacheHit?: boolean;
  readonly workerId?: number;
  readonly metadata?: Readonly<Record<string, string | number | boolean>>;
}

export interface TelemetryConfig {
  enabled?: boolean;

  onEvent?: (event: TelemetryEventBase) => void;
}

export type OutputFormat = 'json' | 'text' | 'sarif' | 'html';

export type FailSeverity = Severity;

export interface ParserOptions {
  project?: string;
  tsconfigRootDir?: string;
  sourceType?: 'module' | 'commonjs';
  ecmaVersion?: number;
}

export interface CacheOptions {
  enabled?: boolean;
  location?: string;
  strategy?: 'memory' | 'local';
  ttl?: number;
}

export interface ConfigOverride {
  files: string | string[];
  rules?: Record<string, RuleConfig>;
}

export type ProfileConfig = Partial<Omit<AnalyzerConfig, 'profiles'>>;

export interface AnalyzerConfig {
  extends?: string | string[];

  include?: string[];

  exclude?: string[];

  maxWorkers?: number;

  cache?: boolean | CacheOptions;

  outputFormat?: OutputFormat;

  outputPath?: string;

  failOnSeverity?: FailSeverity;

  maxWarnings?: number;

  ignorePatterns?: string[];

  plugins?: string[];

  rules?: Record<string, RuleConfig>;

  overrides?: ConfigOverride[];

  parserOptions?: ParserOptions;

  profiles?: Record<string, ProfileConfig>;

  telemetry?: TelemetryConfig;

  angularVersion?: string;
}

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

export interface HealthReport {
  valid: boolean;
  issues: ConfigIssue[];
  config?: unknown;
}

export type ConfigReport = HealthReport;

export interface InitResult {
  success: boolean;
  filePath: string;
  alreadyExists?: boolean;
}

export interface NormalizedAnalyzerConfig extends Omit<
  AnalyzerConfig,
  | 'cache'
  | 'maxWorkers'
  | 'outputFormat'
  | 'failOnSeverity'
  | 'maxWarnings'
  | 'rules'
  | 'angularVersion'
> {
  cache: Required<CacheOptions>;

  maxWorkers: number;

  outputFormat: OutputFormat;

  failOnSeverity: FailSeverity;

  maxWarnings: number;

  rules: Record<string, RuleConfig>;

  angularVersion: string | null;
}

export interface ConfigValidationResult {
  config?: NormalizedAnalyzerConfig;
  report: HealthReport;
}
