/**
 * @fileoverview
 * Pre-computed indexes for the execution plan.
 *
 * The engine queries these indexes in hot paths — e.g. "which files need a
 * TypeScript parse?" or "which tasks target file X?" — so producing them
 * once at plan-build time keeps per-rule iteration to O(1) lookups.
 *
 * Two complementary views are produced:
 *  - File-level indexes: drive parser selection (parse once, reuse).
 *  - Task-level indexes: drive execution-order strategies.
 */

import { debug, type RuleSeverity } from '@ngcompass/common';
import type {
    ExecutionIndexes,
    ExecutionPlan,
    ExecutionStats,
    FileType,
    RuleTask,
    Task,
} from './types.js';

/**
 * Builds every index from an execution plan (file-centric) and an optional
 * task-centric list. The task list is required for `tasksByFile` and
 * `tasksBySeverityLevel`; the rest are derivable from the plan alone.
 */
export function buildIndexes(plan: ExecutionPlan): ExecutionIndexes;
export function buildIndexes(plan: ExecutionPlan, tasks: ReadonlyArray<Task>): ExecutionIndexes;
export function buildIndexes(plan: ExecutionPlan, tasks?: ReadonlyArray<Task>): ExecutionIndexes {
    debug('planner', 'Generating execution indexes...');

    const filesNeedingTsAst = buildFilesNeedingAst(plan, 'typescript');
    const filesNeedingHtmlAst = buildFilesNeedingAst(plan, 'html');
    const filesNeedingCssAst = buildFilesNeedingAst(plan, 'css');
    const filesNeedingTypeChecker = buildFilesNeedingTypeChecker(plan);

    const tasksByFile = tasks ? buildTasksByFile(tasks) : {};
    const tasksBySeverityLevel = tasks ? buildTasksBySeverityLevel(tasks) : emptyTasksBySeverityLevel();
    const tasksByRule = buildTasksByRule(plan);
    const filesByType = buildFilesByType(plan);
    const tasksBySeverity = buildTasksBySeverity(plan);
    const stats = buildStats(plan);

    logIndexSummary(tasks, filesNeedingTsAst, filesNeedingHtmlAst, filesNeedingCssAst, tasksByRule);

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

// ── File-level indexes ────────────────────────────────────────────────────

const buildFilesNeedingAst = (
    plan: ExecutionPlan,
    astType: 'typescript' | 'html' | 'css',
): ReadonlyArray<string> => {
    const files = new Set<string>();
    for (const [filePath, unit] of Object.entries(plan)) {
        if (unit.tasks.some((task) => needsAst(task, astType))) files.add(filePath);
    }
    return Array.from(files).sort();
};

const needsAst = (task: RuleTask, astType: 'typescript' | 'html' | 'css'): boolean => {
    switch (astType) {
        case 'typescript':
            return Boolean(task.inputs.typescript.needsAst);
        case 'html':
            return Boolean(task.inputs.template?.needsAst ?? false);
        case 'css':
            return Boolean(task.inputs.styles?.some((s) => s.needsAst) ?? false);
    }
};

/**
 * Returns files where at least one task needs the TypeScript type-checker
 * OR the project-wide `ProjectContext` (both demand the type-aware path).
 */
const buildFilesNeedingTypeChecker = (plan: ExecutionPlan): ReadonlyArray<string> => {
    const files = new Set<string>();
    for (const [filePath, unit] of Object.entries(plan)) {
        if (unit.tasks.some((task) => task.needsTypeChecker === true || task.needsProjectContext === true)) {
            files.add(filePath);
        }
    }
    return Array.from(files).sort();
};

// ── Task-by-rule / file-by-type ───────────────────────────────────────────

const buildTasksByRule = (plan: ExecutionPlan): Readonly<Record<string, ReadonlyArray<string>>> => {
    const index: Record<string, string[]> = {};
    for (const [filePath, unit] of Object.entries(plan)) {
        for (const task of unit.tasks) {
            (index[task.ruleName] ??= []).push(filePath);
        }
    }
    for (const ruleName of Object.keys(index)) index[ruleName].sort();
    return index;
};

const buildFilesByType = (plan: ExecutionPlan): Readonly<Record<FileType, ReadonlyArray<string>>> => {
    const index = emptyFilesByType();
    for (const [filePath, unit] of Object.entries(plan)) {
        index[unit.file.type].push(filePath);
    }
    for (const type of Object.keys(index) as FileType[]) index[type].sort();
    return index;
};

const emptyFilesByType = (): Record<FileType, string[]> => ({
    component: [], directive: [], pipe: [], service: [],
    module: [], guard: [], logic: [],
    'angular-class': [],
    spec: [], template: [], style: [], config: [], unknown: [],
});

// ── Severity counts and grouping ──────────────────────────────────────────

const buildTasksBySeverity = (plan: ExecutionPlan): Readonly<Record<RuleSeverity, number>> => {
    const counts = emptySeverityCounts();
    for (const unit of Object.values(plan)) {
        for (const task of unit.tasks) counts[task.severity]++;
    }
    return counts;
};

const emptySeverityCounts = (): Record<RuleSeverity, number> => ({ off: 0, warn: 0, error: 0 });

// ── Stats ─────────────────────────────────────────────────────────────────

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

// ── Task-level indexes (task-centric view) ────────────────────────────────

const buildTasksByFile = (
    tasks: ReadonlyArray<Task>,
): Readonly<Record<string, ReadonlyArray<Task>>> => {
    const index: Record<string, Task[]> = {};
    for (const task of tasks) (index[task.filePath] ??= []).push(task);
    for (const filePath of Object.keys(index)) {
        index[filePath].sort((a, b) => a.ruleName.localeCompare(b.ruleName));
    }
    return index;
};

const buildTasksBySeverityLevel = (
    tasks: ReadonlyArray<Task>,
): Readonly<Record<RuleSeverity, ReadonlyArray<Task>>> => {
    const index: Record<RuleSeverity, Task[]> = { off: [], warn: [], error: [] };
    for (const task of tasks) index[task.severity].push(task);
    for (const severity of Object.keys(index) as RuleSeverity[]) {
        index[severity].sort((a, b) => {
            const fileCompare = a.filePath.localeCompare(b.filePath);
            return fileCompare !== 0 ? fileCompare : a.ruleName.localeCompare(b.ruleName);
        });
    }
    return index;
};

/**
 * Returns an empty `tasksBySeverityLevel` index. Used for the
 * file-centric `buildIndexes` overload where no task list is supplied.
 */
const emptyTasksBySeverityLevel = (): Readonly<Record<RuleSeverity, ReadonlyArray<Task>>> => ({
    off: [], warn: [], error: [],
});

// ── Helpers (public API) ──────────────────────────────────────────────────

/** Returns every file mentioned by any of `ruleNames` across the rule index. */
export const getFilesForRules = (
    index: Readonly<Record<string, ReadonlyArray<string>>>,
    ruleNames: ReadonlyArray<string>,
): ReadonlyArray<string> => {
    const files = new Set<string>();
    for (const ruleName of ruleNames) {
        const ruleFiles = index[ruleName];
        if (!ruleFiles) continue;
        for (const file of ruleFiles) files.add(file);
    }
    return Array.from(files).sort();
};

export const getTotalTasks = (indexes: ExecutionIndexes): number => indexes.stats.totalTasks;

export const getTasksCountBySeverity = (
    indexes: ExecutionIndexes,
    severity: RuleSeverity,
): number => indexes.tasksBySeverity[severity];

// ── Internal logging ──────────────────────────────────────────────────────

const logIndexSummary = (
    tasks: ReadonlyArray<Task> | undefined,
    ts: ReadonlyArray<string>,
    html: ReadonlyArray<string>,
    css: ReadonlyArray<string>,
    tasksByRule: Readonly<Record<string, ReadonlyArray<string>>>,
): void => {
    debug('planner', 'Indexing complete:');
    debug('planner', `  - TypeScript AST needed: ${ts.length} files`);
    debug('planner', `  - HTML AST needed:       ${html.length} files`);
    debug('planner', `  - CSS AST needed:        ${css.length} files`);
    debug('planner', `  - Unique rules to run:   ${Object.keys(tasksByRule).length}`);
    if (tasks) debug('planner', `  - Total tasks:           ${tasks.length}`);
};
