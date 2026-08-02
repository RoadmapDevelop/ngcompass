export { buildExecutionPlan, getExecutionPlanSummary } from './builder.js';

export type {
  CacheFilterStats,
  CachePruneOptions,
  ExecutionIndexes,
  ExecutionPlan,
  ExecutionPlanOptions,
  ExecutionPlanOutput,
  ExecutionStats,
  FileAnalysisUnit,
  FileInfo,
  FileInput,
  FileType,
  IncrementalFilterOptions,
  IncrementalPlan,
  ResourceType,
  Result,
  RuleTask,
  Task,
  TaskInputs,
} from './types.js';

export { Ok, Err } from './types.js';

export {
  detectFileType,
  isComponentFile,
  isSpecFile,
  isStyleFile,
  isTemplateFile,
  isTypeScriptFile,
  getBaseName,
} from './file-type.js';

export {
  extractStyleUrls,
  extractTemplateUrl,
} from './decorator-references.js';

export {
  discoverResources,
  getSpecFile,
  getStyleFiles,
  getTemplateFile,
  resourceExists,
} from './resources.js';

export {
  buildTask,
  buildTasksForFileTaskCentric as buildTasksForFile,
  filterRulesByAstRequirement,
  groupRulesByDependencyType,
  shouldApplyRule,
} from './task-builder.js';

export {
  calculateFileHash,
  hashFile,
  hashFileStats,
  hashFiles,
  hashRules,
  hashTaskInputs,
} from './hashing.js';

export {
  buildIndexes,
  getFilesForRules,
  getTasksCountBySeverity,
  getTotalTasks,
} from './indexes.js';

export {
  areAllTasksCached,
  filterCachedTasks,
  getCacheHitRate,
  pruneStaleCache,
} from './incremental.js';

export { groupTasksByFile } from './utils.js';

export {
  getScanFileCount,
  hasScanFiles,
  scanResultToPlanInput,
} from './integration.js';

export type { ScanResultBridge, ScanToPlanOptions } from './integration.js';
