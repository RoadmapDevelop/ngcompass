/**
 * @fileoverview
 * Type declarations shared across the configuration health-check pipeline.
 *
 * Defines the validated-config type derived from the Zod schema, the
 * environmental abstractions injected into checks (`ValidationContext`),
 * and the common return shape every check produces.
 */

import { z } from 'zod';
import type { ConfigIssue } from '@ngcompass/common';
import { AnalyzerConfigSchema } from '../schemas/schema.js';

/** Output type of {@link AnalyzerConfigSchema} after Zod transformation. */
export type ValidatedConfig = z.infer<typeof AnalyzerConfigSchema>;

/** Cache options nested inside a validated config. */
export type CacheConfig = ValidatedConfig['cache'];

/**
 * Environmental abstractions injected into every semantic check.
 *
 * Tests provide a `mockContext` that overrides `fs`, `os`, and `path` so
 * checks remain deterministic and free of real filesystem side effects.
 */
export interface ValidationContext {
    /** Profile name being validated; `undefined` for the root block. */
    profile?: string;
    /** Working directory used for module resolution (e.g. extends chain). */
    cwd: string;
    fs: {
        existsSync: (path: string) => boolean;
        accessSync: (path: string, mode: number) => void;
    };
    os: {
        cpus: () => Array<{ model: string }>;
    };
    path: {
        dirname: (p: string) => string;
        resolve: (...paths: string[]) => string;
        isAbsolute: (p: string) => boolean;
    };
}

/**
 * Subset of fields consumed by the base block check.
 *
 * Accepts the loose shape of a profile entry (where `cache` may still be a
 * boolean) as well as the normalized root config — both flow through the
 * same block validator.
 */
export interface ConfigBlock {
    maxWorkers?: number;
    cache?: boolean | {
        readonly enabled?: boolean;
        readonly location?: string;
        readonly strategy?: 'memory' | 'local';
        readonly ttl?: number;
    };
}

/** Uniform return value from every check. */
export interface ConfigBlockValidation {
    issues: ConfigIssue[];
}

/**
 * Writable mirror of {@link ConfigIssue} — every property of `ConfigIssue` is
 * `readonly` in the public interface, but the validator and the location
 * enricher both need to backfill the `file`, `line`, and `column` fields after
 * the immutable issue has been produced. Casting through this mapped type
 * keeps the mutation localized and documented instead of scattering
 * `as unknown as` casts across the codebase.
 */
export type WritableIssue = { -readonly [K in keyof ConfigIssue]: ConfigIssue[K] };
