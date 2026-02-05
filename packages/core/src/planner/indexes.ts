/**
 * Index Builder
 *
 * Pure functions for building pre-computed indexes for O(1) queries.
 * Indexes enable efficient Phase 2 execution.
 */

import type {
    ExecutionPlan,
    ExecutionIndexes,
    ExecutionStats,
    FileType,
    Task,
} from './types.js';
import type { RuleSeverity } from '../rules/types.js';
import { debug } from '@ngcompass/common';

/**
 * Builds all indexes from execution plan and tasks.
 *
 * Enhanced in Phase 1.75: Builds both file-level and task-level indexes.
 * Overloaded to support both old (plan only) and new (plan + tasks) signatures.
 *
 * @param plan - Execution plan (file-centric view)
 * @param tasks - All tasks (task-centric array, optional for backward compat)
 * @returns Comprehensive pre-computed indexes
 */
export function buildIndexes(plan: ExecutionPlan): ExecutionIndexes;
export function buildIndexes(plan: ExecutionPlan, tasks: ReadonlyArray<Task>): ExecutionIndexes;
export function buildIndexes(plan: ExecutionPlan, tasks?: ReadonlyArray<Task>): ExecutionIndexes {
    debug('planner', 'Generating execution indexes...');

    // File-level indexes (for parsing optimization)
    const filesNeedingTsAst = buildFilesNeedingAst(plan, 'typescript');
    const filesNeedingHtmlAst = buildFilesNeedingAst(plan, 'html');
    const filesNeedingCssAst = buildFilesNeedingAst(plan, 'css');
    const filesNeedingTypeChecker = buildFilesNeedingTypeChecker();

    // Task-level indexes (for execution strategies)
    const tasksByFile = tasks ? buildTasksByFile(tasks) : {};
    const tasksBySeverityLevel = tasks ? buildTasksBySeverityLevel(tasks) : {
        off: [],
        low: [],
        moderate: [],
        high: [],
        critical: [],
        info: [],
    };

    // Backward-compatible indexes
    const tasksByRule = buildTasksByRule(plan);
    const filesByType = buildFilesByType(plan);
    const tasksBySeverity = buildTasksBySeverity(plan);
    const stats = buildStats(plan);

    debug('planner', 'Indexing complete:');
    debug('planner', `  - TypeScript AST needed: ${filesNeedingTsAst.length} files`);
    debug('planner', `  - HTML AST needed:       ${filesNeedingHtmlAst.length} files`);
    debug('planner', `  - CSS AST needed:        ${filesNeedingCssAst.length} files`);
    debug('planner', `  - Unique rules to run:   ${Object.keys(tasksByRule).length}`);
    if (tasks) {
        debug('planner', `  - Total tasks:           ${tasks.length}`);
    }

    return {
        // File-level indexes
        filesNeedingTsAst,
        filesNeedingHtmlAst,
        filesNeedingCssAst,
        filesNeedingTypeChecker,

        // Task-level indexes
        tasksByFile,
        tasksBySeverityLevel,

        // Backward-compatible indexes
        tasksByRule,
        filesByType,
        tasksBySeverity,
        stats,
    };
}

/**
 * Builds index of files needing a specific AST type.
 *
 * @param plan - Execution plan
 * @param astType - AST type
 * @returns Array of file paths
 */
const buildFilesNeedingAst = (
    plan: ExecutionPlan,
    astType: 'typescript' | 'html' | 'css'
): ReadonlyArray<string> => {
    const files = new Set<string>();

    for (const [filePath, unit] of Object.entries(plan)) {
        for (const task of unit.tasks) {
            let needsAst = false;

            switch (astType) {
                case 'typescript':
                    needsAst = task.inputs.typescript.needsAst;
                    break;
                case 'html':
                    needsAst = task.inputs.template?.needsAst ?? false;
                    break;
                case 'css':
                    needsAst = task.inputs.styles?.some((s) => s.needsAst) ?? false;
                    break;
            }

            if (needsAst) {
                files.add(filePath);
                break; // Found one task that needs it, no need to check more
            }
        }
    }

    return Array.from(files).sort();
};

/**
 * Builds index of files needing TypeChecker.
 *
 * @returns Array of file paths
 */
const buildFilesNeedingTypeChecker = (): ReadonlyArray<string> => {
    const files = new Set<string>();
    // Check if any task needs TypeChecker (from rule metadata)
    // This would require passing rule metadata through, so for now we'll skip
    // In real implementation, check task.metadata.requires.typeChecker

    return Array.from(files).sort();
};

/**
 * Builds index of tasks by rule name.
 *
 * @param plan - Execution plan
 * @returns Map of rule name → file paths
 */
const buildTasksByRule = (
    plan: ExecutionPlan
): Readonly<Record<string, ReadonlyArray<string>>> => {
    const index: Record<string, string[]> = {};

    for (const [filePath, unit] of Object.entries(plan)) {
        for (const task of unit.tasks) {
            if (!index[task.ruleName]) {
                index[task.ruleName] = [];
            }
            index[task.ruleName].push(filePath);
        }
    }

    // Sort each array for determinism
    for (const ruleName of Object.keys(index)) {
        index[ruleName].sort();
    }

    return index;
};

/**
 * Builds index of files by file type.
 *
 * @param plan - Execution plan
 * @returns Map of file type → file paths
 */
const buildFilesByType = (
    plan: ExecutionPlan
): Readonly<Record<FileType, ReadonlyArray<string>>> => {
    const index: Record<FileType, string[]> = {
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
    };

    for (const [filePath, unit] of Object.entries(plan)) {
        index[unit.file.type].push(filePath);
    }

    // Sort each array for determinism
    for (const type of Object.keys(index) as FileType[]) {
        index[type].sort();
    }

    return index;
};

/**
 * Builds index of task counts by severity.
 *
 * @param plan - Execution plan
 * @returns Map of severity → count
 */
const buildTasksBySeverity = (
    plan: ExecutionPlan
): Readonly<Record<RuleSeverity, number>> => {
    const counts: Record<RuleSeverity, number> = {
        off: 0,
        low: 0,
        moderate: 0,
        high: 0,
        critical: 0,
        info: 0,
    };

    for (const unit of Object.values(plan)) {
        for (const task of unit.tasks) {
            counts[task.severity]++;
        }
    }

    return counts;
};

/**
 * Builds global statistics.
 *
 * @param plan - Execution plan
 * @returns Execution statistics
 */
const buildStats = (plan: ExecutionPlan): ExecutionStats => {
    const files = Object.values(plan);
    const totalFiles = files.length;
    const totalTasks = files.reduce((sum, unit) => sum + unit.tasks.length, 0);
    const avgTasksPerFile = totalFiles > 0 ? totalTasks / totalFiles : 0;

    let filesWithTemplates = 0;
    let filesWithStyles = 0;
    let filesWithSpecs = 0;

    for (const unit of files) {
        // Check if any task has template/style/spec inputs
        for (const task of unit.tasks) {
            if (task.inputs.template) {
                filesWithTemplates++;
                break;
            }
        }
        for (const task of unit.tasks) {
            if (task.inputs.styles && task.inputs.styles.length > 0) {
                filesWithStyles++;
                break;
            }
        }
        for (const task of unit.tasks) {
            if (task.inputs.spec) {
                filesWithSpecs++;
                break;
            }
        }
    }

    return {
        totalFiles,
        totalTasks,
        avgTasksPerFile,
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
        if (ruleFiles) {
            ruleFiles.forEach((file) => files.add(file));
        }
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
export const getTasksCountBySeverity = (
    indexes: ExecutionIndexes,
    severity: RuleSeverity
): number => {
    return indexes.tasksBySeverity[severity];
};

// ==============================================================================
// TASK-LEVEL INDEX BUILDERS (Phase 1.75)
// ==============================================================================

/**
 * Builds index of tasks grouped by file path.
 *
 * @param tasks - All tasks
 * @returns Map of filePath → tasks
 */
const buildTasksByFile = (tasks: ReadonlyArray<Task>): Readonly<Record<string, ReadonlyArray<Task>>> => {
    const index: Record<string, Task[]> = {};

    for (const task of tasks) {
        if (!index[task.filePath]) {
            index[task.filePath] = [];
        }
        index[task.filePath].push(task);
    }

    // Sort each array by ruleName for determinism
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
    const index: Record<RuleSeverity, Task[]> = {
        off: [],
        low: [],
        moderate: [],
        high: [],
        critical: [],
        info: [],
    };

    for (const task of tasks) {
        index[task.severity].push(task);
    }

    // Sort each array by filePath then ruleName for determinism
    for (const severity of Object.keys(index) as RuleSeverity[]) {
        index[severity].sort((a, b) => {
            const fileCompare = a.filePath.localeCompare(b.filePath);
            if (fileCompare !== 0) return fileCompare;
            return a.ruleName.localeCompare(b.ruleName);
        });
    }

    return index;
};
