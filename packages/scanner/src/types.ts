/**
 * @fileoverview
 * Type contracts for the scanner package.
 *
 * Defines the configuration and result shapes that callers (planner, CLI)
 * depend on. Every type is `readonly` because the scanner produces
 * immutable snapshots — downstream code never mutates its output.
 */

import type { CacheContext } from '@ngcompass/cache';
import { Err, Ok, type Result } from '@ngcompass/common';

// Re-export `Result` from common so consumers can satisfy the scanner API
// without a separate import from a different package.
export type { Result };
export { Ok, Err };

/** Optional value used internally by the gitignore loader. */
export type Option<T> = T | null | undefined;

/** User-facing scanner configuration. */
export interface ScanOptions {
    readonly rootDir: string;
    readonly include: ReadonlyArray<string>;
    readonly exclude: ReadonlyArray<string>;
    readonly ignorePatterns?: ReadonlyArray<string>;
    readonly respectGitignore?: boolean;
    readonly followSymlinks?: boolean;
    /**
     * Whether to match dotfiles and dot-directories (e.g. `.angular/`, `.nx/`).
     * Corresponds to tinyglobby's `dot` option.
     * @default false
     */
    readonly dot?: boolean;
    readonly debug?: boolean;
    readonly cache?: CacheContext;
    /**
     * Optional progress callback invoked at key phases of the scan.
     * Receives the current phase name and the file count known at that point.
     */
    readonly onProgress?: OnProgressCallback;
    /**
     * Optional path to a `tsconfig.json` file. When provided, the scanner
     * narrows discovered files to those the TypeScript compiler would
     * include by merging the tsconfig's `include` / `exclude` / `files`
     * arrays with the scan options.
     *
     * Relative paths inside the tsconfig are resolved against the tsconfig's
     * directory, not `rootDir`.
     */
    readonly tsConfigPath?: string;
}

/** Scanner configuration after defaults are applied. */
export interface NormalizedOptions {
    readonly rootDir: string;
    readonly include: ReadonlyArray<string>;
    readonly exclude: ReadonlyArray<string>;
    readonly ignorePatterns: ReadonlyArray<string>;
    readonly respectGitignore: boolean;
    readonly followSymlinks: boolean;
    /** Resolved value of `ScanOptions.dot` — always a boolean after normalization. */
    readonly dot: boolean;
}

/** Pair of include/ignore glob patterns ready for the glob engine. */
export interface ExpandedPatterns {
    readonly include: ReadonlyArray<string>;
    readonly ignore: ReadonlyArray<string>;
}

/** Initial file list produced by discovery (git or glob). */
export interface RawFileList {
    readonly files: ReadonlyArray<string>;
}

/** File list after ignore + dedup filters have run. */
export interface FilteredFileList {
    readonly files: ReadonlyArray<string>;
    readonly filtered: number;
}

/** Aggregate statistics for a completed scan. */
export interface ScanStatistics {
    readonly totalFiles: number;
    readonly byExtension: ReadonlyMap<string, number>;
    readonly totalSize: number;
    readonly scanTime: number;
    readonly cacheHit: boolean;
}

/** High-resolution per-phase timings. */
export interface ScanTimings {
    readonly normalization: number;
    /** Git or glob phase. */
    readonly discovery: number;
    readonly filtering: number;
    readonly total: number;
}

/** Consolidated scan result. */
export interface ScanResult {
    readonly files: ReadonlyArray<string>;
    readonly stats: ScanStatistics;
    readonly timestamp: number;
    readonly timings?: ScanTimings;
}

/** Predicate that returns `true` when `file` should be KEPT (i.e. not ignored). */
export type GitignoreFilter = (file: string, rootDir: string) => boolean;

// ── Progress reporting ────────────────────────────────────────────────────

/** Lifecycle phases an active scan transitions through. */
export type ScanPhase =
    | 'normalizing'
    | 'discovering'
    | 'filtering'
    | 'calculating-stats'
    | 'complete';

/**
 * Callback invoked at each scan-phase transition with the current file
 * count. Useful for driving progress bars / log output in the CLI.
 *
 * @param phase - The phase that just started (or completed for `'complete'`).
 * @param count - Number of files known at this point in the scan.
 */
export type OnProgressCallback = (phase: ScanPhase, count: number) => void;
