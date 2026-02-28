/**
 * Planner Module
 *
 * Phase 1.75: Build Execution Map
 * Maps discovered files + resolved rules → executable tasks with indexes
 *
 * @module planner
 */

// Main builder
export { buildExecutionPlan, getExecutionPlanSummary } from './builder.js';

// Types
export type {
    // Phase 1.75
    ExecutionPlanOutput,
    ExecutionPlan,
    ExecutionIndexes,
    ExecutionStats,
    FileAnalysisUnit,
    FileInfo,
    FileType,
    RuleTask,
    Task,
    TaskInputs,
    FileInput,
    ResourceType,
    ExecutionPlanOptions,
    Result,
    // Phase 2.0
    IncrementalPlan,
    CacheFilterStats,
    IncrementalFilterOptions,
    CachePruneOptions,
} from './types.js';

export { Ok, Err } from './types.js';

// Utilities
export {
    detectFileType,
    isTypeScriptFile,
    isTemplateFile,
    isStyleFile,
    isSpecFile,
    isComponentFile,
    getBaseName,
} from './file-type.js';

export {
    discoverResources,
    resourceExists,
    getStyleFiles,
    getTemplateFile,
    getSpecFile,
} from './resources.js';

export {
    shouldApplyRule,
    buildTask,
    buildTasksForFileTaskCentric as buildTasksForFile, // Backward compat alias
    filterRulesByAstRequirement,
    groupRulesByDependencyType,
} from './task-builder.js';

export {
    hashFile,
    hashFiles,
    hashRules,
    calculateFileHash,
    hashTaskInputs,
    hashFileStats,
} from './hashing.js';

export {
    buildIndexes,
    getFilesForRules,
    getTotalTasks,
    getTasksCountBySeverity,
} from './indexes.js';

// Phase 2.0: Incremental Analysis
export {
    filterCachedTasks,
    areAllTasksCached,
    getCacheHitRate,
    pruneStaleCache,
} from './incremental.js';

