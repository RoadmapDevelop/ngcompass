export type * from './models/file-filter.js';
export type * from './models/scan-progress.js';
export type {
  ExpandedPatterns,
  NormalizedOptions,
  ScanOptions,
} from './models/scan-options.js';
export type { ScanResult, ScanStatistics } from './models/scan-result.js';

export { Err, Ok } from '@ngcompass/common';
export type { Result } from '@ngcompass/common';

export { scan } from './scan.js';
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
