import type { BaselineConfig } from './baseline.js';
import type { RuleConfig, Severity } from './rule-config.js';
import type { TelemetryConfig } from './telemetry.js';

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

  baseline?: boolean | Partial<BaselineConfig>;

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

export interface NormalizedAnalyzerConfig extends Omit<
  AnalyzerConfig,
  | 'cache'
  | 'baseline'
  | 'maxWorkers'
  | 'outputFormat'
  | 'failOnSeverity'
  | 'maxWarnings'
  | 'rules'
  | 'angularVersion'
> {
  cache: Required<CacheOptions>;

  baseline: BaselineConfig;

  maxWorkers: number;

  outputFormat: OutputFormat;

  failOnSeverity: FailSeverity;

  maxWarnings: number;

  rules: Record<string, RuleConfig>;

  angularVersion: string | null;
}
