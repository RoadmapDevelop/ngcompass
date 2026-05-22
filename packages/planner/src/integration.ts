/**
 * @fileoverview
 * Scanner → planner bridge.
 *
 * Convenience helpers that convert `@ngcompass/scanner`'s `ScanResult` into
 * the inputs expected by `@ngcompass/planner`'s `buildExecutionPlan`.
 *
 * The `ScanResult` shape is duplicated inline (as `ScanResultBridge`)
 * rather than imported from the scanner — adding a scanner→planner import
 * would create a package cycle (planner→cache→cache types→planner) which
 * Turbo would refuse to build. The bridge therefore mirrors only the fields
 * actually used by `scanResultToPlanInput`.
 *
 * This module is intentionally kept self-contained so external consumers
 * (downstream tooling, scripts) can adopt the planner without manually
 * wiring scanner output to `ExecutionPlanOptions`.
 */

import type { ResolvedRule } from '@ngcompass/common';
import type { CacheContext, CacheKeyContext } from '@ngcompass/cache';
import type { ExecutionPlanOptions, IncrementalFilterOptions } from './types.js';

// ==============================================================================
// SCAN RESULT SHAPE (inline so scanner is not a hard dependency of planner)
// ==============================================================================

/**
 * Minimal `ScanResult` shape consumed by the bridge.
 *
 * This matches `@ngcompass/scanner`'s `ScanResult` interface and is kept
 * inline to avoid a circular package dependency (scanner → planner would
 * create a cycle). Only the fields actually used by `scanResultToPlanInput`
 * are listed here.
 */
export interface ScanResultBridge {
    /** Discovered file paths (absolute). */
    readonly files: ReadonlyArray<string>;
    /** Optional scan timestamp (ms since epoch). */
    readonly timestamp?: number;
}

// ==============================================================================
// BRIDGE OPTIONS
// ==============================================================================

/**
 * Options for converting a scan result into planner inputs.
 */
export interface ScanToPlanOptions {
    /** Resolved rules produced by the rule resolver (Phase 1.5). */
    readonly rules: ReadonlyMap<string, ResolvedRule>;

    /** Absolute path to the project root. */
    readonly rootDir: string;

    /** Optional cache context for persistent plan and result caching. */
    readonly cache?: CacheContext;

    /** Debug mode: emit detailed timing output to the planner logger. */
    readonly debug?: boolean;

    /** Options for incremental (cache-based) task filtering. */
    readonly incremental?: IncrementalFilterOptions;

    /**
     * Version context for cache key generation. Strongly recommended for
     * production use — omitting risks stale cache hits after a tool upgrade.
     */
    readonly cacheKeyCtx?: CacheKeyContext;

    /**
     * File count threshold above which task-building switches to parallel
     * worker threads. Forwarded verbatim to `ExecutionPlanOptions`.
     * @default 10000
     */
    readonly parallelThreshold?: number;

    /**
     * Number of worker threads used in parallel mode.
     * @default 4
     */
    readonly workerCount?: number;
}

// ==============================================================================
// BRIDGE FUNCTION
// ==============================================================================

/**
 * Converts a `ScanResult` (from `@ngcompass/scanner`) into an
 * `ExecutionPlanOptions` object ready to pass to `buildExecutionPlan`.
 *
 * @example
 * ```typescript
 * import { scan } from '@ngcompass/scanner';
 * import { buildExecutionPlan } from '@ngcompass/planner';
 * import { scanResultToPlanInput } from '@ngcompass/planner/integration';
 *
 * const scanResult = await scan({ rootDir: '.', include: [], exclude: [] });
 * if (!scanResult.ok) throw scanResult.error;
 *
 * const planOptions = scanResultToPlanInput(scanResult.data, {
 *   rules,
 *   rootDir: '.',
 *   cache,
 * });
 *
 * const plan = await buildExecutionPlan(planOptions);
 * ```
 *
 * @param scanResult - Result of a successful `scan()` call.
 * @param opts       - Planner configuration (rules, rootDir, cache, …).
 * @returns           `ExecutionPlanOptions` ready for `buildExecutionPlan`.
 */
export const scanResultToPlanInput = (
    scanResult: ScanResultBridge,
    opts: ScanToPlanOptions
): ExecutionPlanOptions => {
    return {
        files: scanResult.files,
        rules: opts.rules,
        rootDir: opts.rootDir,
        cache: opts.cache,
        debug: opts.debug,
        incremental: opts.incremental,
        cacheKeyCtx: opts.cacheKeyCtx,
        parallelThreshold: opts.parallelThreshold,
        workerCount: opts.workerCount,
    };
};

/**
 * Returns `true` if the scan produced at least one file that the planner
 * can operate on (i.e. the file list is non-empty).
 *
 * Useful as a fast guard before calling `buildExecutionPlan`.
 *
 * @param scanResult - Bridge-compatible scan result.
 */
export const hasScanFiles = (scanResult: ScanResultBridge): boolean =>
    scanResult.files.length > 0;

/**
 * Returns the discovered file count from a scan result.
 *
 * @param scanResult - Bridge-compatible scan result.
 */
export const getScanFileCount = (scanResult: ScanResultBridge): number =>
    scanResult.files.length;
