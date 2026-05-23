/**
 * @fileoverview
 * Public entry point for `@ngcompass/planner`.
 *
 * The planner turns the scanner's file list plus the resolved rule set into
 * an `ExecutionPlanOutput`: a flat task array, a file-centric plan view, and
 * pre-computed indexes consumed by the engine. Cache layering, incremental
 * filtering, and worker-thread orchestration all live inside the builder —
 * external consumers see only the inputs / outputs surfaced here.
 */

// ── Core builder ─────────────────────────────────────────────────────────
export { buildExecutionPlan, getExecutionPlanSummary } from './builder.js';

// ── Public types ─────────────────────────────────────────────────────────
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

// ── File-type detection ──────────────────────────────────────────────────
export {
    detectFileType,
    isComponentFile,
    isSpecFile,
    isStyleFile,
    isTemplateFile,
    isTypeScriptFile,
    getBaseName,
} from './file-type.js';

// ── Resource discovery ───────────────────────────────────────────────────
export {
    discoverResources,
    getSpecFile,
    getStyleFiles,
    getTemplateFile,
    resourceExists,
} from './resources.js';

// ── Task building ────────────────────────────────────────────────────────
export {
    buildTask,
    /** Backward-compat alias for `buildTasksForFileTaskCentric`. */
    buildTasksForFileTaskCentric as buildTasksForFile,
    filterRulesByAstRequirement,
    groupRulesByDependencyType,
    shouldApplyRule,
} from './task-builder.js';

// ── Hashing primitives ───────────────────────────────────────────────────
export {
    calculateFileHash,
    hashFile,
    hashFileStats,
    hashFiles,
    hashRules,
    hashTaskInputs,
} from './hashing.js';

// ── Index queries ────────────────────────────────────────────────────────
export {
    buildIndexes,
    getFilesForRules,
    getTasksCountBySeverity,
    getTotalTasks,
} from './indexes.js';

// ── Incremental (cache-driven) filtering ─────────────────────────────────
export {
    areAllTasksCached,
    filterCachedTasks,
    getCacheHitRate,
    pruneStaleCache,
} from './incremental.js';

// ── Utility helpers ──────────────────────────────────────────────────────
export { groupTasksByFile } from './utils.js';

// ── Scanner ↔ planner bridge ─────────────────────────────────────────────
export {
    getScanFileCount,
    hasScanFiles,
    scanResultToPlanInput,
} from './integration.js';

export type { ScanResultBridge, ScanToPlanOptions } from './integration.js';
