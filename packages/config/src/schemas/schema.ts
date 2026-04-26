import { z } from 'zod';
import type { CacheOptions } from '@ngcompass/common';
import { DEFAULT_CONFIG, DEFAULT_CACHE_OPTIONS, getDefaultMaxWorkers } from './defaults.js';

/**
 * Shared Schema Fragments
 * Reusable Zod definitions to maintain consistency across the base config and overrides.
 */
const SeveritySchema = z.enum(['warn', 'error']);
const OutputFormatSchema = z.enum(['json', 'text', 'sarif', 'html']);

/**
 * Defines the structure for an individual rule. 
 * Supports both shorthand (severity string) and verbose (object with options) syntax.
 */
const RuleDefinitionSchema = z.union([
    SeveritySchema,
    z.literal('off'),
    z.object({
        severity: z.union([SeveritySchema, z.literal('off')]),
        options: z.record(z.string(), z.unknown()).optional()
    })
]);

const CacheOptionsSchema = z.object({
    enabled: z.boolean().optional(),
    location: z.string().optional(),
    strategy: z.enum(['memory', 'local']).optional(),
    ttl: z.number().optional()
});

const ParserOptionsSchema = z.object({
    project: z.string().optional(),
    tsconfigRootDir: z.string().optional(),
    sourceType: z.enum(['module', 'commonjs']).optional(),
    ecmaVersion: z.number().optional()
});

/**
 * Base Analyzer Configuration Schema
 * Defines the core fields available in both the root configuration and profiles.
 */
const BaseAnalyzerConfigSchema = z.object({
    extends: z.union([z.string(), z.array(z.string())]).optional(),

    include: z.array(z.string()).default([...DEFAULT_CONFIG.include]),
    exclude: z.array(z.string()).default([...DEFAULT_CONFIG.exclude]),

    /**
     * Execution Control
     * 'concurrency' is supported as a legacy alias for 'maxWorkers'.
     */
    maxWorkers: z.number().optional(),
    concurrency: z.number().optional(),

    /**
     * Caching Strategy
     * Supports boolean toggles, full objects, or the legacy 'cacheLocation' field.
     */
    cache: z.union([z.boolean(), CacheOptionsSchema]).optional(),
    cacheLocation: z.string().optional(),

    /**
     * Reporting & Failure Thresholds
     */
    outputFormat: OutputFormatSchema.default(DEFAULT_CONFIG.outputFormat),
    outputPath: z.string().optional(),
    failOnSeverity: SeveritySchema.default(DEFAULT_CONFIG.failOnSeverity),
    maxWarnings: z.number().default(DEFAULT_CONFIG.maxWarnings),
    ignorePatterns: z.array(z.string()).optional(),

    /**
     * Rules & Overrides
     */
    rules: z.record(z.string(), RuleDefinitionSchema).optional(),
    overrides: z.array(z.object({
        files: z.union([z.string(), z.array(z.string())]),
        rules: z.record(z.string(), RuleDefinitionSchema).optional()
    })).optional(),

    parserOptions: ParserOptionsSchema.optional()
});

/**
 * Exported Types
 * Derived from the Zod schemas to ensure type sync.
 */
export type AnalyzerConfig = z.infer<typeof BaseAnalyzerConfigSchema> & {
    profiles?: Record<string, any>;
};

/**
 * Profile Schema
 * Profiles allow partial overrides of the base configuration.
 */
export const ProfileConfigSchema: z.ZodType<Partial<z.infer<typeof BaseAnalyzerConfigSchema>>> =
    z.lazy(() => BaseAnalyzerConfigSchema.partial());

/**
 * Main Analyzer Config Schema
 * This schema handles the 'normalization' phase. It resolves aliases, 
 * merges defaults with cache settings, and ensures non-nullable arrays.
 */
export const AnalyzerConfigSchema: z.ZodType<AnalyzerConfig> = BaseAnalyzerConfigSchema.extend({
    profiles: z.record(z.string(), ProfileConfigSchema).optional()
}).transform((data) => {
    /**
     * Normalization: Execution Resource Allocation
     */
    const maxWorkers = data.maxWorkers ?? data.concurrency ?? getDefaultMaxWorkers();

    /**
     * Normalization: Cache Resolution
     * Merges boolean or partial objects into a full, valid CacheOptions structure.
     */
    let cache: Required<CacheOptions>;

    if (data.cache === false) {
        cache = { ...DEFAULT_CACHE_OPTIONS, enabled: false };
    } else if (data.cache === true || data.cache === undefined) {
        const location = data.cacheLocation ?? DEFAULT_CACHE_OPTIONS.location;
        cache = { ...DEFAULT_CACHE_OPTIONS, location };
    } else {
        cache = { ...DEFAULT_CACHE_OPTIONS, ...data.cache };
    }

    /**
     * Data Integrity: Collection Defaults
     * Ensures that array-based fields return empty arrays rather than undefined 
     * to simplify consumption by the rest of the engine.
     */
    return {
        ...data,
        maxWorkers,
        cache,
        rules: data.rules ?? {},
        overrides: data.overrides ?? [],
        ignorePatterns: data.ignorePatterns ?? []
    };
});
