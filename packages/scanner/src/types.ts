/**
 * @fileoverview
 * Definitional contracts and primitive types for the @ngcompass/scanner package.
 *
 * Adheres to functional programming principles by ensuring type immutability
 * and providing explicit structures for configuration, results, and progress reporting.
 */

import { Result, Ok, Err } from '@ngcompass/common';

/**
 * Utility constructors for the Result type.
 */
// Result type imported from @ngcompass/common
export type { Result };
export { Ok, Err };

import type { CacheContext } from '@ngcompass/cache';

/**
 * Represents a value that may be present, null, or undefined.
 */
export type Option<T> = T | null | undefined;

/**
 * Defines the input configuration options for a scanner operation.
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
 * Represents scanner configuration options after the application of project defaults.
 */
export interface NormalizedOptions {
    readonly rootDir: string;
    readonly include: ReadonlyArray<string>;
    readonly exclude: ReadonlyArray<string>;
    readonly ignorePatterns: ReadonlyArray<string>;
    readonly respectGitignore: boolean;
    readonly followSymlinks: boolean;
    /** Resolved value of ScanOptions.dot β€” always a boolean after normalization. */
    readonly dot: boolean;
}

/**
 * Represents a set of inclusion and exclusion glob patterns.
 */
export interface ExpandedPatterns {
    readonly include: ReadonlyArray<string>;
    readonly ignore: ReadonlyArray<string>;
}

/**
 * Represents the initial collection of file paths discovered by the scanner.
 */
export interface RawFileList {
    readonly files: ReadonlyArray<string>;
}

/**
 * Represents a file collection after the application of ignore and deduplication filters.
 */
export interface FilteredFileList {
    readonly files: ReadonlyArray<string>;
    readonly filtered: number; // Number of files filtered out
}

/**
 * Encapsulates statistical metadata for a completed scan operation.
 */
export interface ScanStatistics {
    readonly totalFiles: number;
    readonly byExtension: ReadonlyMap<string, number>;
    readonly totalSize: number;
    readonly scanTime: number;
    readonly cacheHit: boolean;
}

/**
 * Encapsulates high-resolution timing data for various scan phases.
 */
export interface ScanTimings {
    readonly normalization: number;
    readonly discovery: number; // git or glob
    readonly filtering: number;
    readonly total: number;
}

/**
 * Encapsulates the consolidated results and metadata of a scan operation.
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
 * Represents the distinct phases of an active scan operation.
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
