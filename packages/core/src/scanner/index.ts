/**
 * Scanner Module - Public API
 *
 * Functional file discovery system following FP principles.
 */

// Main scan function
export { scan } from './scan.js';

// Types
export type {
    ScanOptions,
    ScanResult,
    ScanStatistics,
    NormalizedOptions,
    ExpandedPatterns,
    Result,
    Option,
    GitignoreFilter
} from './types.js';

export { Ok, Err } from './types.js';

// Pure utility functions (can be used independently)
export { normalizeOptions, validateOptions } from './normalize.js';
export { expandPatterns, normalizePattern, isValidPattern, validatePatterns } from './patterns.js';
export { deduplicateFiles, filterByExtension, filterByPattern } from './filters.js';
export { groupFilesByExtension, calculateStats, formatExtensionBreakdown, calculateSummary } from './stats.js';
export { createGitignoreFilter, createPassThroughFilter } from './gitignore.js';
