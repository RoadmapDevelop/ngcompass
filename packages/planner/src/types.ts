/**
 * Execution Plan Types
 *
 * Maps discovered files + resolved rules → executable tasks with indexes.
 */

import type { CacheContext } from '@ngcompass/cache';
import type { CacheKeyContext } from '@ngcompass/cache';
import { Result, Ok, Err, ResolvedRule, RuleSeverity, AnalysisResult } from '@ngcompass/common';

// ==============================================================================
// EXECUTION PLAN OUTPUT
// ==============================================================================

/**
 * Complete execution plan output (plan + tasks + indexes)
 *
 * - tasks: Flat array of all tasks (task-centric, content-addressed)
 * - plan: File-grouped view (file-centric, backward compatible)
 * - indexes: Pre-computed indexes for both file and task queries
 */
export interface ExecutionPlanOutput {
    /** All tasks to execute (primary execution structure) */
    readonly tasks: ReadonlyArray<Task>;

    /** File-grouped view (backward compatible, derived from tasks) */
    readonly plan: ExecutionPlan;

    /** Pre-computed indexes for efficient queries */
    readonly indexes: ExecutionIndexes;

    /** Tasks that were skipped */
    readonly skippedTasks: ReadonlyArray<Task>;

    /** Pre-loaded cached results (taskId → result) */
    readonly cachedResults?: ReadonlyMap<string, unknown>;

    /** Global content hash for the entire plan */
    readonly globalHash?: string;

    /** Pre-computed analysis result (if fully cached) */
    readonly precomputedAnalysis?: AnalysisResult;

    /**
     * Files whose tasks were not found in the result cache and will be
     * re-analysed. Populated when `options.cache` is provided and incremental
     * filtering has run. `undefined` when caching is disabled.
     */
    readonly changedFiles?: ReadonlyArray<string>;

    /**
     * Files whose tasks were found in the result cache and skipped.
     * Populated when `options.cache` is provided and incremental
     * filtering has run. `undefined` when caching is disabled.
     */
    readonly cachedFiles?: ReadonlyArray<string>;
}

/**
 * Execution plan - one entry per discovered file
 */
export type ExecutionPlan = Readonly<Record<string, FileAnalysisUnit>>;

// ==============================================================================
// FILE ANALYSIS UNIT
// ==============================================================================

/**
 * A single file that needs to be analyzed
 */
export interface FileAnalysisUnit {
    /** The primary file being analyzed */
    readonly file: FileInfo;

    /** All the tasks/rules that will run on this file */
    readonly tasks: ReadonlyArray<RuleTask>;
}

/**
 * Information about the file being analyzed
 */
export interface FileInfo {
    /** File path (absolute) */
    readonly path: string;

    /** File type (component, service, etc) */
    readonly type: FileType;

    /** Content hash for cache invalidation */
    readonly hash: string;
}

/**
 * File type classification.
 *
 * `'unknown'` is used for files that do not match any recognised Angular or
 * TypeScript pattern (e.g. stray JSON, Markdown, or binary files that
 * somehow enter the file list). Rules are never applied to `'unknown'` files.
 */
export type FileType =
    | 'component'
    | 'directive'
    | 'pipe'
    | 'service'
    | 'module'
    | 'guard'
    | 'logic'
    | 'template'
    | 'style'
    | 'config'
    | 'unknown';

// ==============================================================================
// RULE TASK
// ==============================================================================

/**
 * A single rule execution task
 */
export interface RuleTask {
    /** Which rule to run */
    readonly ruleName: string;

    /** Rule severity level */
    readonly severity: RuleSeverity;

    /** Rule options (configuration from resolved rules) */
    readonly options: Readonly<Record<string, unknown>>;

    /** Cache key for this specific task */
    readonly cacheKey: string;

    /** What files this task needs to read and analyze */
    readonly inputs: TaskInputs;

    /**
     * Whether this task requires the TypeScript type-checker (expensive!).
     * When true the file is included in `indexes.filesNeedingTypeChecker` so
     * the engine can set up a full TypeScript Program for that file.
     */
    readonly needsTypeChecker?: boolean;

    /**
     * Whether this task requires a pre-computed `ProjectContext` (CTX-001).
     * Routed to the type-aware execution path alongside `needsTypeChecker`.
     */
    readonly needsProjectContext?: boolean;
}

/**
 * All the files this task needs to read
 */
export interface TaskInputs {
    /** TypeScript file input (always present) */
    typescript: FileInput;

    /** Template file input (if needed) */
    template?: FileInput;

    /** Style files input (if needed) */
    styles?: ReadonlyArray<FileInput>;

    /** Spec file input (if needed) */
    spec?: FileInput;
}

/**
 * A single file input for a task
 */
export interface FileInput {
    /** Path to the file (absolute) */
    readonly path: string;

    /** Content hash of this file (SHA-256) */
    readonly hash: string;

    /** Does this task need to parse this file into AST? */
    readonly needsAst: boolean;
}

/**
 * Resource type enum
 */
export type ResourceType = 'typescript' | 'template' | 'styles' | 'spec';

// ==============================================================================
// TASK (Task-Centric Architecture)
// ==============================================================================

/**
 * A single executable task (task-centric architecture)
 *
 * Task is the fundamental unit of execution with content-based identity.
 * Unlike RuleTask (file-centric), Task uses content-addressable cache keys
 * that survive file renames and enable precise cache invalidation.
 *
 * Key differences from RuleTask:
 * - taskId: Content-based (SHA-256 of all inputs + options)
 * - filePath: Explicit (not embedded in cache key)
 * - inputs: Include content hashes for each file
 */
export interface Task {
    /**
     * Content-based task identifier (primary cache key)
     *
     * Format: SHA256(ruleName + typescript.hash + template?.hash + styles?.hashes + spec?.hash + options)
     *
     * This enables:
     * - Cache hits even after file renames (content unchanged)
     * - Precise invalidation (only affected tasks)
     * - Cross-project cache sharing (same content = same ID)
     */
    readonly taskId: string;

    /** Which rule to execute */
    readonly ruleName: string;

    /** Which file is being analyzed */
    readonly filePath: string;

    /** Rule severity level */
    readonly severity: RuleSeverity;

    /** Rule options (configuration) */
    readonly options: Readonly<Record<string, unknown>>;

    /** Input files with content hashes */
    readonly inputs: TaskInputs;

    /**
     * Whether this task requires the TypeScript type-checker (expensive!).
     * Mirrors `RuleTask.needsTypeChecker` on the task-centric view.
     */
    readonly needsTypeChecker?: boolean;

    /**
     * Whether this task requires a pre-computed `ProjectContext` (CTX-001).
     *
     * When `true` the task is routed to the type-aware execution path on the
     * main thread (same as `needsTypeChecker`) because `ProjectContext` is
     * built from the TypeScript `Program` created there.
     * Rules receive the context via `RuleContext.project`.
     */
    readonly needsProjectContext?: boolean;
}

// ==============================================================================
// EXECUTION INDEXES
// ==============================================================================

/**
 * Pre-computed indexes for efficient engine queries
 *
 * - File-level indexes: For parsing optimization (parse once, reuse)
 * - Task-level indexes: For execution strategies (by rule, by severity, etc)
 */
export interface ExecutionIndexes {
    // File-level indexes (for parsing optimization)
    /** Files that need TypeScript AST parsing */
    readonly filesNeedingTsAst: ReadonlyArray<string>;

    /** Files that need HTML AST parsing */
    readonly filesNeedingHtmlAst: ReadonlyArray<string>;

    /** Files that need CSS AST parsing */
    readonly filesNeedingCssAst: ReadonlyArray<string>;

    /**
     * Files that need the TypeScript type-checker (expensive!).
     * The engine should allocate a full TypeScript Program only for these files.
     */
    readonly filesNeedingTypeChecker: ReadonlyArray<string>;

    // Task-level indexes (for execution strategies)
    /** Tasks grouped by file path: filePath → tasks */
    readonly tasksByFile: Readonly<Record<string, ReadonlyArray<Task>>>;

    /** Tasks grouped by rule name: ruleName → tasks */
    readonly tasksByRule: Readonly<Record<string, ReadonlyArray<string>>>;

    /** Tasks grouped by severity: severity → tasks */
    readonly tasksBySeverityLevel: Readonly<Record<RuleSeverity, ReadonlyArray<Task>>>;

    // File-level grouping (backward compatible)
    /** Files grouped by type: fileType → file paths */
    readonly filesByType: Readonly<Record<FileType, ReadonlyArray<string>>>;

    /** Task count by severity level (backward compatible) */
    readonly tasksBySeverity: Readonly<Record<RuleSeverity, number>>;

    /** Global statistics */
    readonly stats: ExecutionStats;
}

/**
 * Global execution statistics
 */
export interface ExecutionStats {
    /** Total files in the plan */
    readonly totalFiles: number;

    /** Total tasks to execute */
    readonly totalTasks: number;

    /** Average tasks per file */
    readonly avgTasksPerFile: number;

    /** Files with templates */
    readonly filesWithTemplates: number;

    /** Files with styles */
    readonly filesWithStyles: number;

    /** Files with specs */
    readonly filesWithSpecs: number;
}

// ==============================================================================
// BUILDER OPTIONS
// ==============================================================================

/**
 * Options for building the execution plan
 */
export interface ExecutionPlanOptions {
    /** Discovered files from Phase 1 */
    readonly files: ReadonlyArray<string>;

    /** Resolved rules from Phase 1.5 */
    readonly rules: ReadonlyMap<string, ResolvedRule>;

    /** Root directory for resolving relative paths */
    readonly rootDir: string;

    /** Optional cache context for persistent optimizations */
    readonly cache?: CacheContext;

    /** Debug mode for detailed timing logging */
    readonly debug?: boolean;

    /** Options for incremental filtering */
    readonly incremental?: IncrementalFilterOptions;

    /**
     * Version context for cache key generation.
     * When provided, toolVersion and ruleRegistryHash are embedded in taskIds
     * and globalHash, ensuring caches are invalidated on tool / rule-set upgrades.
     *
     * Strongly recommended for production use. Omitting risks stale result-cache
     * hits after an upgrade.
     */
    readonly cacheKeyCtx?: CacheKeyContext;

    /**
     * Number of files at which task-building switches from sequential to
     * parallel (worker threads). Defaults to 10 000.
     *
     * Lower this value to enable parallelism on smaller projects.
     * Set to `Infinity` to always use the sequential path (useful for debugging).
     */
    readonly parallelThreshold?: number;

    /**
     * Number of worker threads to use when parallel mode is active.
     * Defaults to 4.
     */
    readonly workerCount?: number;
}

// ==============================================================================
// INCREMENTAL ANALYSIS
// ==============================================================================

/**
 * Incremental execution plan with cache-based filtering
 */
export interface IncrementalPlan {
    /** Tasks with results in cache (can be skipped) */
    readonly skippedTasks: ReadonlyArray<Task>;

    /** Tasks without cache entries (must be executed) */
    readonly tasks: ReadonlyArray<Task>;

    /** Pre-loaded cached results (taskId → result) */
    readonly cachedResults: ReadonlyMap<string, unknown>;

    /** Cache statistics */
    readonly stats: CacheFilterStats;
}

/**
 * Cache filtering statistics
 */
export interface CacheFilterStats {
    /** Total tasks in execution plan */
    readonly totalTasks: number;

    /** Tasks found in cache */
    readonly cachedTasks: number;

    /** Tasks not in cache (need execution) */
    readonly pendingTasks: number;

    /** Cache hit rate (0.0 to 1.0) */
    readonly cacheHitRate: number;

    /**
     * Estimated percentage of execution time saved due to caching (0–100).
     *
     * Computed as `cacheHitRate × 100`, which is accurate when tasks have
     * roughly equal cost. Use as a fast approximation for progress UIs and
     * log messages.
     */
    readonly timeSavedEstimate: number;
}

/**
 * Options for incremental filtering
 */
export interface IncrementalFilterOptions {
    /** Force re-execution even if cached */
    readonly forceRerun?: boolean;

    /** Load cached results into memory */
    readonly loadCachedResults?: boolean;

    /** Maximum age of cached results (ms) */
    readonly maxCacheAge?: number;
}

/**
 * Options for cache pruning
 */
export interface CachePruneOptions {
    /** Maximum age of cache entries (ms) */
    readonly maxAge?: number;

    /** Maximum number of entries to keep */
    readonly maxEntries?: number;

    /** Minimum hit count to keep */
    readonly minHits?: number;
}

// ==============================================================================
// RESULT TYPE
// ==============================================================================

/**
 * Result type for execution plan builder
 */
// Result type imported from @ngcompass/common
export type { Result };
export { Ok, Err };
