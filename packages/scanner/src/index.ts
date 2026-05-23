/**
 * @fileoverview
 * Public entry point for `@ngcompass/scanner`.
 *
 * Surfaces the `scan` function, the option / result type contracts, and a
 * small set of helpers (option normalization, pattern expansion, filter
 * primitives) that downstream code reuses. `Option<T>` is intentionally
 * kept package-internal — callers should use `T | undefined` directly.
 */

export { scan } from './scan.js';
export type {
    ExpandedPatterns,
    GitignoreFilter,
    NormalizedOptions,
    OnProgressCallback,
    Result,
    ScanOptions,
    ScanPhase,
    ScanResult,
    ScanStatistics,
} from './types.js';

export { Err, Ok } from './types.js';
export { normalizeOptions, validateOptions } from './normalize.js';
export { expandPatterns, isValidPattern, normalizePattern, validatePatterns } from './patterns.js';
export { deduplicateFiles, filterByExtension, filterByPattern } from './filters.js';
export { calculateStats } from './stats.js';
export {
    createGitignoreFilter,
    createPassThroughFilter,
    loadAllGitignoreFilters,
} from './gitignore.js';
