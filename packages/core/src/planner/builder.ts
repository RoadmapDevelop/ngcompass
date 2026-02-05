/**
 * Execution Plan Builder
 *
 * Main pipeline for building execution plan from discovered files + resolved rules.
 * Orchestrates all Phase 1.75 components.
 */

import type {
    ExecutionPlanOptions,
    ExecutionPlanOutput,
    FileAnalysisUnit,
    Task,
    Result,
} from './types.js';
import { Ok, Err } from './types.js';
import { debug, time, timeLog } from '@ngcompass/common';
import { detectFileType } from './file-type.js';
import { buildTasksForFile, buildTask } from './task-builder.js';
import { calculateFileHash } from './hashing.js';
import { buildIndexes } from './indexes.js';

/**
 * Builds complete execution plan with indexes (task-centric + file-centric).
 *
 * Enhanced Phase 1.75 pipeline (Task-Centric Migration):
 * 1. For each rule, for each file (task-centric loop order)
 * 2. Build Task with content-based taskId
 * 3. Convert tasks[] → plan (file-centric view for backward compat)
 * 4. Build comprehensive indexes (file-level + task-level)
 *
 * @param options - Build options (files + rules)
 * @returns ExecutionPlanOutput with tasks[] + plan + indexes
 */
export const buildExecutionPlan = (
    options: ExecutionPlanOptions
): Result<ExecutionPlanOutput> => {
    const timerLabel = 'buildExecutionPlan';
    time(timerLabel);

    try {
        const { files, rules } = options;
        debug('planner', `Building execution plan for ${files.length} files and ${rules.size} rules`);

        // Validate inputs
        if (files.length === 0) {
            return Err(new Error('No files to analyze'));
        }

        if (rules.size === 0) {
            return Err(new Error('No rules configured'));
        }

        // Build tasks array (task-centric: rules → files)
        debug('planner', 'Building tasks (task-centric)...');
        const tasks = buildAllTasks(files, rules);

        // Convert tasks → plan (file-centric view for backward compatibility)
        debug('planner', 'Converting tasks to file-centric plan...');
        const plan = convertTasksToPlan(tasks, rules);

        // Build comprehensive indexes (file-level + task-level)
        debug('planner', `Building indexes for ${tasks.length} tasks...`);
        const indexes = buildIndexes(plan, tasks);

        timeLog(timerLabel, 'planner', 'Execution plan built');

        return Ok({
            tasks,
            plan,
            indexes,
        });
    } catch (error) {
        const err = error as Error;
        debug('planner', `Error building plan: ${err.message}`);
        return Err(new Error(`Failed to build execution plan: ${err.message}`));
    }
};

/**
 * Builds a single file analysis unit.
 *
 * @param filePath - File path
 * @param rules - All resolved rules
 * @returns FileAnalysisUnit or null if no applicable rules
 */
const buildFileAnalysisUnit = (
    filePath: string,
    rules: ReadonlyMap<string, any>
): FileAnalysisUnit | null => {
    // Detect file type
    const fileType = detectFileType(filePath);

    // Build tasks for this file
    const tasks = buildTasksForFile(filePath, fileType, rules);

    // Skip files with no applicable tasks
    if (tasks.length === 0) {
        debug('planner', `  - ${filePath}: Skipped (no applicable rules)`);
        return null;
    }

    debug('planner', `  - ${filePath}: ${fileType} (${tasks.length} tasks)`);

    // Get applicable rules for hash calculation
    const applicableRules = Array.from(rules.values()).filter((rule) =>
        tasks.some((task) => task.ruleName === rule.name)
    );

    // Calculate content hash
    // Use first task's inputs as representative (they should all have same resources)
    const hash = tasks.length > 0 ? calculateFileHash(tasks[0].inputs, applicableRules) : '';

    return {
        file: {
            path: filePath,
            type: fileType,
            hash,
        },
        tasks,
    };
};

/**
 * Builds execution plan for a single file (useful for testing).
 *
 * @param filePath - File path
 * @param rules - All resolved rules
 * @returns FileAnalysisUnit or null
 */
export const buildFileUnit = (
    filePath: string,
    rules: ReadonlyMap<string, any>
): FileAnalysisUnit | null => {
    return buildFileAnalysisUnit(filePath, rules);
};

/**
 * Validates execution plan output.
 *
 * @param output - Execution plan output
 * @returns true if valid
 */
export const validateExecutionPlan = (output: ExecutionPlanOutput): boolean => {
    // Check plan exists
    if (!output.plan || Object.keys(output.plan).length === 0) {
        return false;
    }

    // Check indexes exist
    if (!output.indexes) {
        return false;
    }

    // Check stats match
    const planFileCount = Object.keys(output.plan).length;
    const statsFileCount = output.indexes.stats.totalFiles;

    if (planFileCount !== statsFileCount) {
        return false;
    }

    return true;
};

/**
 * Gets execution plan summary (for logging).
 *
 * @param output - Execution plan output
 * @returns Summary string
 */
export const getExecutionPlanSummary = (output: ExecutionPlanOutput): string => {
    const { stats } = output.indexes;
    const lines: string[] = [];

    lines.push('--- Execution Plan Summary ---');
    lines.push(`Total files: ${stats.totalFiles}`);
    lines.push(`Total tasks: ${stats.totalTasks}`);
    lines.push(`Avg tasks per file: ${stats.avgTasksPerFile.toFixed(1)}`);
    lines.push(`Files with templates: ${stats.filesWithTemplates}`);
    lines.push(`Files with styles: ${stats.filesWithStyles}`);
    lines.push(`Files with specs: ${stats.filesWithSpecs}`);
    lines.push('');

    // Group by severity
    const { tasksBySeverity } = output.indexes;
    lines.push('Tasks by severity:');
    lines.push(`  Critical: ${tasksBySeverity.critical}`);
    lines.push(`  High: ${tasksBySeverity.high}`);
    lines.push(`  Moderate: ${tasksBySeverity.moderate}`);
    lines.push(`  Low: ${tasksBySeverity.low}`);
    lines.push(`  Info: ${tasksBySeverity.info}`);

    return lines.join('\n');
};

// ==============================================================================
// TASK-CENTRIC BUILDERS (Phase 1.75)
// ==============================================================================

/**
 * Builds all tasks using task-centric approach (rules → files).
 *
 * This is the core of the task-centric architecture:
 * - Loops rules first, then files (reversed from file-centric)
 * - Creates Task objects with content-based taskId
 * - Enables flexible execution strategies later
 *
 * @param files - Discovered files
 * @param rules - Resolved rules
 * @returns Array of all tasks
 */
const buildAllTasks = (
    files: ReadonlyArray<string>,
    rules: ReadonlyMap<string, any>
): ReadonlyArray<Task> => {
    const tasks: Task[] = [];

    // Task-centric loop: rules → files
    for (const [ruleName, rule] of rules) {
        debug('planner', `  Processing rule: ${ruleName}`);

        for (const filePath of files) {
            const fileType = detectFileType(filePath);
            const task = buildTask(filePath, fileType, rule);

            if (task) {
                tasks.push(task);
            }
        }
    }

    debug('planner', `  Built ${tasks.length} tasks total`);
    return tasks;
};

/**
 * Converts flat tasks array to file-centric plan (backward compatibility).
 *
 * Groups tasks by file and creates FileAnalysisUnit structure
 * that matches the original file-centric plan format.
 *
 * @param tasks - All tasks
 * @param rules - Resolved rules (for hash calculation)
 * @returns File-centric plan
 */
const convertTasksToPlan = (
    tasks: ReadonlyArray<Task>,
    rules: ReadonlyMap<string, any>
): Record<string, FileAnalysisUnit> => {
    const plan: Record<string, FileAnalysisUnit> = {};

    // Group tasks by file
    const tasksByFile = new Map<string, Task[]>();
    for (const task of tasks) {
        if (!tasksByFile.has(task.filePath)) {
            tasksByFile.set(task.filePath, []);
        }
        tasksByFile.get(task.filePath)!.push(task);
    }

    // Build FileAnalysisUnit for each file
    for (const [filePath, fileTasks] of tasksByFile) {
        const fileType = detectFileType(filePath);

        // Get applicable rules for this file
        const applicableRules = Array.from(rules.values()).filter((rule) =>
            fileTasks.some((task) => task.ruleName === rule.name)
        );

        // Calculate file-level hash (for backward compatibility with file-centric caching)
        // Use first task's inputs as representative
        const hash =
            fileTasks.length > 0
                ? calculateFileHash(fileTasks[0].inputs, applicableRules)
                : '';

        // Convert Task[] to RuleTask[] for backward compatibility
        const ruleTasks = fileTasks.map((task) => ({
            ruleName: task.ruleName,
            severity: task.severity,
            options: task.options,
            cacheKey: task.taskId, // Use taskId as cacheKey for now
            inputs: task.inputs,
        }));

        plan[filePath] = {
            file: {
                path: filePath,
                type: fileType,
                hash,
            },
            tasks: ruleTasks,
        };
    }

    return plan;
};
