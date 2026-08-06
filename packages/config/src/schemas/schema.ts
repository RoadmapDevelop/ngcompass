import { z } from 'zod';
import type { CacheOptions } from '@ngcompass/common';
import {
  DEFAULT_CACHE_OPTIONS,
  DEFAULT_CONFIG,
  getDefaultMaxWorkers,
} from './defaults.js';

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
    rules: data.rules ?? {},
    overrides: data.overrides ?? [],
    ignorePatterns: data.ignorePatterns ?? [],
    angularVersion: data.angularVersion ?? null,
  };
});
