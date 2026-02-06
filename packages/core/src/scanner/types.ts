/**
 * Scanner Type Definitions
 *
 * All types are immutable (readonly) following FP principles.
 */

/**
 * Result type for error handling (no exceptions)
 */
export type Result<T, E = Error> =
    | { readonly ok: true; readonly data: T }
    | { readonly ok: false; readonly error: E };

/**
 * Helper constructors for Result type
 */
export const Ok = <T>(data: T): Result<T> => ({ ok: true, data });
export const Err = <E>(error: E): Result<never, E> => ({ ok: false, error });

import type { CacheContext } from '../cache/index.js';

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
    readonly debug?: boolean;
    readonly cache?: CacheContext;
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
