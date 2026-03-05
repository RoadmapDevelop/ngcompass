/**
 * Scanner Type Definitions
 *
 * All types are immutable (readonly) following FP principles.
 */

import { Result, Ok, Err } from '@ngcompass/common';

/**
 * Helper constructors for Result type
 */
// Result type imported from @ngcompass/common
export type { Result };
export { Ok, Err };

import type { CacheContext } from '@ngcompass/cache';

/**
 * Option type for nullable values
 */
export type Option<T> = T | null | undefined;

/**
 * Scanner configuration options (input)
 */
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
     * narrows discovered files to those the TypeScript compiler would include
     * by merging the tsconfig's `include` / `exclude` / `files` arrays with
     * the scan options.
     *
     * Relative paths inside the tsconfig are resolved against the tsconfig's
     * directory, not `rootDir`.
     */
    readonly tsConfigPath?: string;
}

/**
 * Normalized scanner options (after applying defaults)
 */
export interface NormalizedOptions {
    readonly rootDir: string;
    readonly include: ReadonlyArray<string>;
    readonly exclude: ReadonlyArray<string>;
    readonly ignorePatterns: ReadonlyArray<string>;
    readonly respectGitignore: boolean;
    readonly followSymlinks: boolean;
    /** Resolved value of ScanOptions.dot — always a boolean after normalization. */
    readonly dot: boolean;
}

/**
 * Expanded glob patterns (ready for fast-glob)
 */
export interface ExpandedPatterns {
    readonly include: ReadonlyArray<string>;
    readonly ignore: ReadonlyArray<string>;
}

/**
 * Raw file list from glob execution
 */
export interface RawFileList {
    readonly files: ReadonlyArray<string>;
}

/**
 * Filtered file list after applying all filters
 */
export interface FilteredFileList {
    readonly files: ReadonlyArray<string>;
    readonly filtered: number; // Number of files filtered out
}

/**
 * Scan statistics
 */
export interface ScanStatistics {
    readonly totalFiles: number;
    readonly byExtension: ReadonlyMap<string, number>;
    readonly totalSize: number;
    readonly scanTime: number;
    readonly cacheHit: boolean;
}

/**
 * Complete scan result
 */
/**
 * Scan timing breakdown (for debugging)
 */
export interface ScanTimings {
    readonly normalization: number;
    readonly discovery: number; // git or glob
    readonly filtering: number;
    readonly total: number;
}

/**
 * Complete scan result
 */
export interface ScanResult {
    readonly files: ReadonlyArray<string>;
    readonly stats: ScanStatistics;
    readonly timestamp: number;
    readonly timings?: ScanTimings;
}

/**
 * Gitignore filter function type
 */
export type GitignoreFilter = (file: string, rootDir: string) => boolean;

// ==============================================================================
// PROGRESS REPORTING
// ==============================================================================

/**
 * Phases of a scan operation, emitted in order via `ScanOptions.onProgress`.
 *
 * - `normalizing`       — Options are being validated and defaults applied.
 * - `discovering`       — Files are being located (git ls-files or glob).
 * - `filtering`         — Gitignore and dedup filters are being applied.
 * - `calculating-stats` — File sizes are being accumulated for statistics.
 * - `complete`          — Scan finished; `count` is the final file count.
 */
export type ScanPhase =
    | 'normalizing'
    | 'discovering'
    | 'filtering'
    | 'calculating-stats'
    | 'complete';

/**
 * Callback invoked at each scan phase transition with the current file count.
 * Useful for driving progress bars or log output in CLI consumers.
 *
 * @param phase - The phase that just started (or completed for 'complete').
 * @param count - Number of files known at this point in the scan.
 */
export type OnProgressCallback = (phase: ScanPhase, count: number) => void;
