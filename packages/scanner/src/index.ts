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
export {
  expandPatterns,
  isValidPattern,
  normalizePattern,
  validatePatterns,
} from './patterns.js';
export {
  deduplicateFiles,
  filterByExtension,
  filterByPattern,
} from './filters.js';
export { calculateStats } from './stats.js';
export {
  createGitignoreFilter,
  createPassThroughFilter,
  loadAllGitignoreFilters,
} from './gitignore.js';
