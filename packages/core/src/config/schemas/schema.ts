import { z } from 'zod';
import type { CacheOptions } from '@ngcompass/common';
import { DEFAULT_CONFIG, DEFAULT_CACHE_OPTIONS, getDefaultMaxWorkers } from './defaults.js';

/**
 * Zod definitions matching @ngcompass/common types
 */
const SeveritySchema = z.enum(['critical', 'high', 'moderate', 'low', 'info']);
const OutputFormatSchema = z.enum(['json', 'text', 'sarif', 'html']);

const CacheOptionsSchema = z.object({
    enabled: z.boolean().optional(),
    location: z.string().optional(),
    strategy: z.enum(['memory', 'local']).optional(),
    ttl: z.number().optional()
});

/**
 * Watch Options Schema
 */
const WatchOptionsSchema = z.object({
    debounce: z.number().optional(),
    ignored: z.array(z.string()).optional()
});

/**
 * Parser Options Schema
 */
const ParserOptionsSchema = z.object({
    project: z.string().optional(),
    tsconfigRootDir: z.string().optional(),
    sourceType: z.enum(['module', 'commonjs']).optional(),
    ecmaVersion: z.number().optional()
});

/**
 * Main Analyzer Config Schema
 * Accepts flexible input (aliases, booleans) and transforms to strict output.
 */
export const AnalyzerConfigSchema = z.object({
    extends: z.union([z.string(), z.array(z.string())]).optional(),

    include: z.array(z.string()).default(DEFAULT_CONFIG.include),
    exclude: z.array(z.string()).default(DEFAULT_CONFIG.exclude),

    // Execution
    maxWorkers: z.number().optional(),
    concurrency: z.number().optional(), // alias

    // Caching (Handling boolean | object | legacy location)
    cache: z.union([z.boolean(), CacheOptionsSchema]).optional(),
    cacheLocation: z.string().optional(), // deprecated

    watch: z.boolean().default(false),
    watchOptions: WatchOptionsSchema.optional(),

    autoFix: z.boolean().default(false),
    autoFixOnSave: z.boolean().default(false),

    // Reporting
    outputFormat: OutputFormatSchema.default(DEFAULT_CONFIG.outputFormat as any),
    outputPath: z.string().optional(),
    failOnSeverity: SeveritySchema.default(DEFAULT_CONFIG.failOnSeverity as any),
    maxWarnings: z.number().default(DEFAULT_CONFIG.maxWarnings),
    reportUnusedDisableDirectives: z.boolean().default(DEFAULT_CONFIG.reportUnusedDisableDirectives),
    ignorePatterns: z.array(z.string()).optional(),

    // Rules & Overrides
    rules: z.record(z.string(), z.union([
        SeveritySchema,
        z.literal('off'),
        z.object({
            severity: z.union([SeveritySchema, z.literal('off')]),
            options: z.record(z.string(), z.unknown()).optional()
        })
    ])).optional(),

    overrides: z.array(z.object({
        files: z.union([z.string(), z.array(z.string())]),
        rules: z.record(z.string(), z.union([
            SeveritySchema,
            z.literal('off'),
            z.object({
                severity: z.union([SeveritySchema, z.literal('off')]),
                options: z.record(z.string(), z.unknown()).optional()
            })
        ])).optional()
    })).optional(),

    parserOptions: ParserOptionsSchema.optional(),

    profiles: z.record(z.string(), z.any()).optional()
}).transform((data) => {
    // 1. Resolve maxWorkers
    const maxWorkers = data.maxWorkers ?? data.concurrency ?? getDefaultMaxWorkers();

    // 2. Resolve Cache
    let cache: Required<CacheOptions>;
    if (data.cache === false) {
        cache = { ...DEFAULT_CACHE_OPTIONS, enabled: false };
    } else if (data.cache === true) {
        cache = DEFAULT_CACHE_OPTIONS;
    } else if (typeof data.cache === 'object') {
        cache = { ...DEFAULT_CACHE_OPTIONS, ...data.cache };
    } else {
        // undefined case
        // Check legacy cacheLocation
        if (data.cacheLocation) {
            // Warn about deprecation? (Log elsewhere, transformation should just handle data)
            cache = { ...DEFAULT_CACHE_OPTIONS, location: data.cacheLocation };
        } else {
            cache = DEFAULT_CACHE_OPTIONS;
        }
    }

    // 3. Construct Normalized Config
    return {
        ...data,
        maxWorkers,
        cache,
        rules: data.rules ?? {}, // ensure rules object exists
        overrides: data.overrides ?? [],
        ignorePatterns: data.ignorePatterns ?? [],
        watchOptions: data.watchOptions ?? {}
    };
});

export type AnalyzerConfig = z.infer<typeof AnalyzerConfigSchema>;
