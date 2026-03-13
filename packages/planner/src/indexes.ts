/**
 * Index Builder
 *
 * Pure functions for building pre-computed indexes for O(1) queries.
 * Indexes enable efficient incremental execution strategies.
 */

import type { ExecutionPlan, ExecutionIndexes, ExecutionStats, FileType, Task } from "./types.js";
import { debug, RuleSeverity } from "@ngcompass/common";

/**
 * Builds all indexes from execution plan and optional task list.
 *
 * @param plan - Execution plan (file-centric view)
 * @param tasks - Task-centric list (optional for backward compatibility)
 * @returns Comprehensive pre-computed indexes
 */
export function buildIndexes(plan: ExecutionPlan): ExecutionIndexes;
export function buildIndexes(plan: ExecutionPlan, tasks: ReadonlyArray<Task>): ExecutionIndexes;
export function buildIndexes(plan: ExecutionPlan, tasks?: ReadonlyArray<Task>): ExecutionIndexes {
    debug("planner", "Generating execution indexes...");

    const filesNeedingTsAst = buildFilesNeedingAst(plan, "typescript");
    const filesNeedingHtmlAst = buildFilesNeedingAst(plan, "html");
    const filesNeedingCssAst = buildFilesNeedingAst(plan, "css");
    const filesNeedingTypeChecker = buildFilesNeedingTypeChecker(plan);

    const tasksByFile = tasks ? buildTasksByFile(tasks) : {};
    const tasksBySeverityLevel = tasks ? buildTasksBySeverityLevel(tasks) : createEmptyTasksBySeverityLevel();

    const tasksByRule = buildTasksByRule(plan);
    const filesByType = buildFilesByType(plan);
    const tasksBySeverity = buildTasksBySeverity(plan);
    const stats = buildStats(plan);

    logIndexSummary(plan, tasks, filesNeedingTsAst, filesNeedingHtmlAst, filesNeedingCssAst, tasksByRule);

    return {
        filesNeedingTsAst,
        filesNeedingHtmlAst,
        filesNeedingCssAst,
        filesNeedingTypeChecker,
        tasksByFile,
        tasksBySeverityLevel,
        tasksByRule,
        filesByType,
        tasksBySeverity,
        stats,
    };
}

/**
 * Builds an index of files needing a specific AST type.
 *
 * @param plan - Execution plan
 * @param astType - AST type
 * @returns Sorted array of file paths
 */
const buildFilesNeedingAst = (
    plan: ExecutionPlan,
    astType: "typescript" | "html" | "css"
): ReadonlyArray<string> => {
    const files = new Set<string>();

    for (const [filePath, unit] of Object.entries(plan)) {
        if (unit.tasks.some((task) => needsAst(task, astType))) {
            files.add(filePath);
        }
    }

    return Array.from(files).sort();
};

/**
 * Determines whether a task requires a given AST type.
 *
 * @param task - Task to inspect
 * @param astType - AST type
 * @returns true if task requires the AST type
 */
const needsAst = (task: any, astType: "typescript" | "html" | "css"): boolean => {
    switch (astType) {
        case "typescript":
            return Boolean(task.inputs.typescript.needsAst);
        case "html":
            return Boolean(task.inputs.template?.needsAst ?? false);
        case "css":
            return Boolean(task.inputs.styles?.some((s: any) => s.needsAst) ?? false);
    }
};

/**
 * Builds an index of files needing a TypeChecker.
 *
 * A file is included when at least one of its tasks has
 * `needsTypeChecker === true`, which is set by task-builder when the
 * underlying rule declares `requires.typeChecker` in its metadata.
 *
 * @param plan - Execution plan
 * @returns Sorted array of file paths
 */
const buildFilesNeedingTypeChecker = (plan: ExecutionPlan): ReadonlyArray<string> => {
    const files = new Set<string>();

    for (const [filePath, unit] of Object.entries(plan)) {
        // CTX-001: include files where any task needs the TypeScript type-checker
        // OR the project-wide ProjectContext (both require the type-aware path).
        if (unit.tasks.some((task) => task.needsTypeChecker === true || task.needsProjectContext === true)) {
            files.add(filePath);
        }
    }

    return Array.from(files).sort();
};

/**
 * Builds index of tasks by rule name.
 *
 * @param plan - Execution plan
 * @returns Map of rule name → sorted file paths
 */
const buildTasksByRule = (plan: ExecutionPlan): Readonly<Record<string, ReadonlyArray<string>>> => {
    const index: Record<string, string[]> = {};

    for (const [filePath, unit] of Object.entries(plan)) {
        for (const task of unit.tasks) {
            (index[task.ruleName] ??= []).push(filePath);
        }
    }

    for (const ruleName of Object.keys(index)) {
        index[ruleName].sort();
    }

    return index;
};

/**
 * Builds index of files by file type.
 *
 * @param plan - Execution plan
 * @returns Map of file type → sorted file paths
 */
const buildFilesByType = (plan: ExecutionPlan): Readonly<Record<FileType, ReadonlyArray<string>>> => {
    const index: Record<FileType, string[]> = createEmptyFilesByTypeIndex();

    for (const [filePath, unit] of Object.entries(plan)) {
        index[unit.file.type].push(filePath);
    }

    for (const type of Object.keys(index) as FileType[]) {
        index[type].sort();
    }

    return index;
};

/**
 * Creates an empty files-by-type index.
 *
 * @returns Initialized files-by-type index
 */
const createEmptyFilesByTypeIndex = (): Record<FileType, string[]> => {
    return {
        component: [],
        directive: [],
        pipe: [],
        service: [],
        module: [],
        guard: [],
        logic: [],
        template: [],
        style: [],
        config: [],
        unknown: [],
    };
};

/**
 * Builds index of task counts by severity.
 *
 * @param plan - Execution plan
 * @returns Map of severity → count
 */
const buildTasksBySeverity = (plan: ExecutionPlan): Readonly<Record<RuleSeverity, number>> => {
    const counts: Record<RuleSeverity, number> = createEmptySeverityCounts();

    for (const unit of Object.values(plan)) {
        for (const task of unit.tasks) {
            counts[task.severity]++;
        }
    }

    return counts;
};

/**
 * Creates an empty severity-count record.
 *
 * @returns Initialized severity counts
 */
const createEmptySeverityCounts = (): Record<RuleSeverity, number> => {
    return { off: 0, warn: 0, error: 0 };
};

/**
 * Builds global execution statistics.
 *
 * @param plan - Execution plan
 * @returns Execution statistics
 */
const buildStats = (plan: ExecutionPlan): ExecutionStats => {
    const units = Object.values(plan);
    const totalFiles = units.length;

    let totalTasks = 0;
    let filesWithTemplates = 0;
    let filesWithStyles = 0;
    let filesWithSpecs = 0;

    for (const unit of units) {
        totalTasks += unit.tasks.length;

        if (unit.tasks.some((t) => Boolean(t.inputs.template))) filesWithTemplates++;
        if (unit.tasks.some((t) => Boolean(t.inputs.styles?.length))) filesWithStyles++;
        if (unit.tasks.some((t) => Boolean(t.inputs.spec))) filesWithSpecs++;
    }

    return {
        totalFiles,
        totalTasks,
        avgTasksPerFile: totalFiles > 0 ? totalTasks / totalFiles : 0,
        filesWithTemplates,
        filesWithStyles,
        filesWithSpecs,
    };
};

/**
 * Filters index to get files for specific rules.
 *
 * @param index - TasksByRule index
 * @param ruleNames - Rule names to filter by
 * @returns Combined array of file paths
 */
export const getFilesForRules = (
    index: Readonly<Record<string, ReadonlyArray<string>>>,
    ruleNames: ReadonlyArray<string>
): ReadonlyArray<string> => {
    const files = new Set<string>();

    for (const ruleName of ruleNames) {
        const ruleFiles = index[ruleName];
        if (!ruleFiles) continue;
        for (const file of ruleFiles) files.add(file);
    }

    return Array.from(files).sort();
};

/**
 * Gets total task count from indexes.
 *
 * @param indexes - Execution indexes
 * @returns Total task count
 */
export const getTotalTasks = (indexes: ExecutionIndexes): number => {
    return indexes.stats.totalTasks;
};

/**
 * Gets tasks count for a specific severity level.
 *
 * @param indexes - Execution indexes
 * @param severity - Severity level
 * @returns Task count
 */
export const getTasksCountBySeverity = (indexes: ExecutionIndexes, severity: RuleSeverity): number => {
    return indexes.tasksBySeverity[severity];
};

/**
 * Builds index of tasks grouped by file path.
 *
 * @param tasks - All tasks
 * @returns Map of filePath → tasks
 */
const buildTasksByFile = (tasks: ReadonlyArray<Task>): Readonly<Record<string, ReadonlyArray<Task>>> => {
    const index: Record<string, Task[]> = {};

    for (const task of tasks) {
        (index[task.filePath] ??= []).push(task);
    }

    for (const filePath of Object.keys(index)) {
        index[filePath].sort((a, b) => a.ruleName.localeCompare(b.ruleName));
    }

    return index;
};

/**
 * Builds index of tasks grouped by severity level.
 *
 * @param tasks - All tasks
 * @returns Map of severity → tasks
 */
const buildTasksBySeverityLevel = (
    tasks: ReadonlyArray<Task>
): Readonly<Record<RuleSeverity, ReadonlyArray<Task>>> => {
    const index = createEmptyTasksBySeverityLevelMutable();

    for (const task of tasks) {
        index[task.severity].push(task);
    }

    for (const severity of Object.keys(index) as RuleSeverity[]) {
        index[severity].sort((a, b) => {
            const fileCompare = a.filePath.localeCompare(b.filePath);
            if (fileCompare !== 0) return fileCompare;
            return a.ruleName.localeCompare(b.ruleName);
        });
    }

    return index;
};

/**
 * Creates an empty tasks-by-severity index in readonly shape.
 *
 * @returns Empty tasks-by-severity index
 */
const createEmptyTasksBySeverityLevel = (): Readonly<Record<RuleSeverity, ReadonlyArray<Task>>> => {
    return { off: [], warn: [], error: [] };
};

/**
 * Creates an empty tasks-by-severity index in mutable shape for building.
 *
 * @returns Empty tasks-by-severity index
 */
const createEmptyTasksBySeverityLevelMutable = (): Record<RuleSeverity, Task[]> => {
    return { off: [], warn: [], error: [] };
};

/**
 * Logs a summary of produced indexes.
 *
 * @param plan - Execution plan
 * @param tasks - Task list if provided
 * @param ts - Files needing TS AST
 * @param html - Files needing HTML AST
 * @param css - Files needing CSS AST
 * @param tasksByRule - TasksByRule index
 */
const logIndexSummary = (
    plan: ExecutionPlan,
    tasks: ReadonlyArray<Task> | undefined,
    ts: ReadonlyArray<string>,
    html: ReadonlyArray<string>,
    css: ReadonlyArray<string>,
    tasksByRule: Readonly<Record<string, ReadonlyArray<string>>>
): void => {
    void plan;

    debug("planner", "Indexing complete:");
    debug("planner", `  - TypeScript AST needed: ${ts.length} files`);
    debug("planner", `  - HTML AST needed:       ${html.length} files`);
    debug("planner", `  - CSS AST needed:        ${css.length} files`);
    debug("planner", `  - Unique rules to run:   ${Object.keys(tasksByRule).length}`);
    if (tasks) debug("planner", `  - Total tasks:           ${tasks.length}`);
};

