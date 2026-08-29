import { z } from 'zod';
import type { BaselineConfig, CacheOptions } from '@ngcompass/common';
import {
  DEFAULT_BASELINE_OPTIONS,
  DEFAULT_CACHE_OPTIONS,
  DEFAULT_CONFIG,
  getDefaultMaxWorkers,
} from './defaults.js';

export type ValidatedConfig = z.infer<typeof AnalyzerConfigSchema>;

function normalizeBaseline(
  value: boolean | z.infer<typeof BaselineOptionsSchema> | undefined
): BaselineConfig {
  if (value === undefined || typeof value === 'boolean') {
    return { ...DEFAULT_BASELINE_OPTIONS, enabled: value === true };
  }

  return {
    enabled: value.enabled ?? true,
    path: value.path ?? DEFAULT_BASELINE_OPTIONS.path,
    onStale: value.onStale ?? DEFAULT_BASELINE_OPTIONS.onStale,
  };
}

export type CacheConfig = ValidatedConfig['cache'];

const SeveritySchema = z.enum(['warn', 'error']);
const OutputFormatSchema = z.enum(['json', 'text', 'sarif', 'html']);

const RuleDefinitionSchema = z.union([
  SeveritySchema,
  z.literal('off'),
  z.object({
    severity: z.union([SeveritySchema, z.literal('off')]),
    options: z.record(z.string(), z.unknown()).optional(),
  }),
]);

const CacheOptionsSchema = z.object({
  enabled: z.boolean().optional(),
  location: z.string().optional(),
  strategy: z.enum(['memory', 'local']).optional(),
  ttl: z.number().optional(),
});

const BaselineOptionsSchema = z.object({
  enabled: z.boolean().optional(),
  path: z.string().optional(),
  onStale: z.enum(['ignore', 'warn', 'error']).optional(),
});

const ParserOptionsSchema = z.object({
  project: z.string().optional(),
  tsconfigRootDir: z.string().optional(),
  sourceType: z.enum(['module', 'commonjs']).optional(),
  ecmaVersion: z.number().optional(),
});

const BaseAnalyzerConfigSchema = z.object({
  extends: z.union([z.string(), z.array(z.string())]).optional(),

  include: z.array(z.string()).default(() => [...DEFAULT_CONFIG.include]),
  exclude: z.array(z.string()).default(() => [...DEFAULT_CONFIG.exclude]),

  maxWorkers: z.number().optional(),
  concurrency: z.number().optional(),

  cache: z.union([z.boolean(), CacheOptionsSchema]).optional(),
  cacheLocation: z.string().optional(),

  baseline: z.union([z.boolean(), BaselineOptionsSchema]).optional(),

  outputFormat: OutputFormatSchema.default(DEFAULT_CONFIG.outputFormat),
  outputPath: z.string().optional(),
  failOnSeverity: SeveritySchema.default(DEFAULT_CONFIG.failOnSeverity),
  maxWarnings: z.number().default(DEFAULT_CONFIG.maxWarnings),
  ignorePatterns: z.array(z.string()).optional(),

  rules: z.record(z.string(), RuleDefinitionSchema).optional(),
  overrides: z
    .array(
      z.object({
        files: z.union([z.string(), z.array(z.string())]),
        rules: z.record(z.string(), RuleDefinitionSchema).optional(),
      })
    )
    .optional(),

  parserOptions: ParserOptionsSchema.optional(),

  angularVersion: z.string().optional(),
});

export type AnalyzerConfig = z.infer<typeof BaseAnalyzerConfigSchema> & {
  profiles?: Record<string, unknown>;
};

export const ProfileConfigSchema: z.ZodType<
  Partial<z.infer<typeof BaseAnalyzerConfigSchema>>
> = z.lazy(() => BaseAnalyzerConfigSchema.partial());

export const AnalyzerConfigSchema = BaseAnalyzerConfigSchema.extend({
  profiles: z.record(z.string(), ProfileConfigSchema).optional(),
}).transform((data) => {
  const maxWorkers =
    data.maxWorkers ?? data.concurrency ?? getDefaultMaxWorkers();

  let cache: Required<CacheOptions>;
  if (data.cache === false) {
    cache = { ...DEFAULT_CACHE_OPTIONS, enabled: false };
  } else if (data.cache === true || data.cache === undefined) {
    const location = data.cacheLocation ?? DEFAULT_CACHE_OPTIONS.location;
    cache = { ...DEFAULT_CACHE_OPTIONS, location };
  } else {
    cache = { ...DEFAULT_CACHE_OPTIONS, ...data.cache };
  }

  return {
    ...data,
    maxWorkers,
    cache,
    baseline: normalizeBaseline(data.baseline),
    rules: data.rules ?? {},
    overrides: data.overrides ?? [],
    ignorePatterns: data.ignorePatterns ?? [],
    angularVersion: data.angularVersion ?? null,
  };
});
