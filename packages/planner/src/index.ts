export { buildExecutionPlan, getExecutionPlanSummary } from './plan-building/builder.js';

export type * from './models/execution-index.js';
export type * from './models/execution-plan.js';
export type * from './models/file.js';
export type * from './models/incremental.js';
export type * from './models/scan-bridge.js';
export type * from './models/task.js';

export { Ok, Err } from '@ngcompass/common';
export type { Result } from '@ngcompass/common';

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
} from './resource-discovery/decorator-references.js';

export {
  discoverResources,
  getSpecFile,
  getStyleFiles,
  getTemplateFile,
  resourceExists,
} from './resource-discovery/resources.js';

export {
  buildTask,
  buildTasksForFileTaskCentric as buildTasksForFile,
  filterRulesByAstRequirement,
  groupRulesByDependencyType,
  shouldApplyRule,
} from './plan-building/task-builder.js';

export {
  calculateFileHash,
  hashFile,
  hashFileStats,
  hashFiles,
  hashRules,
  hashTaskInputs,
} from './task-identity/hashing.js';

export {
  buildIndexes,
  getFilesForRules,
  getTasksCountBySeverity,
  getTotalTasks,
} from './incremental-analysis/indexes.js';

export {
  areAllTasksCached,
  filterCachedTasks,
  getCacheHitRate,
  pruneStaleCache,
} from './incremental-analysis/incremental.js';

export { groupTasksByFile } from './task-identity/utils.js';

export {
  getScanFileCount,
  hasScanFiles,
  scanResultToPlanInput,
} from './plan-building/integration.js';
