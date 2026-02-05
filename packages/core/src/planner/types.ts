/**
 * Execution Plan Types
 *
 * Types for Phase 1.75: Build Execution Map
 * Maps discovered files + resolved rules → executable tasks with indexes
 */

import type { RuleSeverity, ResolvedRule } from '../rules/types.js';

// ==============================================================================
// EXECUTION PLAN OUTPUT
// ==============================================================================

/**
 * Complete execution plan output (plan + tasks + indexes)
 *
 * Enhanced in Phase 1.75: Task-Centric Migration
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
 * File type classification
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
    | 'config';

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
 *
 * Enhanced in Phase 1.75: Added hash for content-based cache keys
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
 *
 * @since Phase 1.75 - Task-Centric Migration
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
}

// ==============================================================================
// EXECUTION INDEXES
// ==============================================================================

/**
 * Pre-computed indexes for efficient Phase 2 queries
 *
 * Enhanced in Phase 1.75: Added task-level indexes alongside file-level indexes
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

    /** Files that need TypeChecker (expensive!) */
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
}

// ==============================================================================
// RESULT TYPE
// ==============================================================================

/**
 * Result type for execution plan builder
 */
export type Result<T, E = Error> =
    | { readonly ok: true; readonly data: T }
    | { readonly ok: false; readonly error: E };

export const Ok = <T>(data: T): Result<T> => ({ ok: true, data });
export const Err = <E>(error: E): Result<never, E> => ({ ok: false, error });
