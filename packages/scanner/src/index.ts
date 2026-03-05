
export { scan } from './scan.js';
export type {
    ScanOptions,
    ScanResult,
    ScanStatistics,
    NormalizedOptions,
    ExpandedPatterns,
    Result,
    Option,
    GitignoreFilter,
    ScanPhase,
    OnProgressCallback,
} from './types.js';

export { Ok, Err } from './types.js';
export { normalizeOptions, validateOptions } from './normalize.js';
export { expandPatterns, normalizePattern, isValidPattern, validatePatterns } from './patterns.js';
export { deduplicateFiles, filterByExtension, filterByPattern } from './filters.js';
export { groupFilesByExtension, calculateStats, formatExtensionBreakdown, calculateSummary } from './stats.js';
export { createGitignoreFilter, createPassThroughFilter, loadAllGitignoreFilters } from './gitignore.js';
