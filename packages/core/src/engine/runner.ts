/**
 * Shared Execution Runner
 *
 * Consolidates rule execution logic shared between the orchestrator (local/sequential)
 * and the execution worker (parallel).
 */

import { Task } from "../planner/index.js";
import { RuleResult, RuleContext, RuleSeverity } from "../rules/types.js";
import { error, warn } from "@ngcompass/common";
import { isNewEngineRule, executeBatchedNewEngineRules } from "../rules/engine/adapter.js";
import type { Program } from "oxc-parser";
import type { HtmlParserResult } from "../parsers/html.js";
import type { CssResult } from "../parsers/css.js";

/**
 * Interface definition for context required to execute tasks.
 * Abstracts over local vs worker environment.
 */
export interface ExecutionContext {
    readonly rootDir: string;
    readonly readFile: (filePath: string) => Promise<string>;
    readonly getProgram: (filePath: string) => Promise<Program>;
    readonly getTemplate: (filePath: string) => Promise<HtmlParserResult | undefined>;
    readonly getStyle: (filePath: string) => Promise<CssResult | undefined>;
}

/**
 * Executes a batch of tasks for a single file using the provided context.
 *
 * @param tasks - Tasks to execute (MUST all be for the same file)
 * @param context - Execution context (provides file access, parsing)
 * @returns Array of RuleResults
 */
export const executeBatchedTasks = async (
    tasks: ReadonlyArray<Task>,
    context: ExecutionContext
): Promise<RuleResult[]> => {
    if (tasks.length === 0) return [];

    // 1. Group tasks by options (and filter for new engine)
    const batches = new Map<string, {
        options: any,
        ruleNames: string[],
        taskIds: string[],
        severities: Map<string, RuleSeverity>
    }>();
    const results: RuleResult[] = [];

    for (const task of tasks) {
        if (!isNewEngineRule(task.ruleName)) {
            warn("engine", `Skipping task ${task.taskId}: Rule "${task.ruleName}" not registered in new engine.`);
            results.push({
                ruleName: task.ruleName,
                taskId: task.taskId,
                failures: []
            });
            continue;
        }

        const optionsKey = JSON.stringify(task.options || {});
        const batch = batches.get(optionsKey) ?? {
            options: task.options,
            ruleNames: [] as string[],
            taskIds: [] as string[],
            severities: new Map<string, RuleSeverity>()
        };
        batch.ruleNames.push(task.ruleName);
        batch.taskIds.push(task.taskId);
        batch.severities.set(task.ruleName, task.severity);
        batches.set(optionsKey, batch);
    }

    // 2. Execute Batches
    // All tasks are for the same file, so we load resources once per file
    // (Optimization: In theory we could load once per batch, but it's the same file)
    let fileContent: string | undefined;
    let program: Program | undefined;
    let template: HtmlParserResult | undefined;

    // TODO: Intelligent lazy loading based on rule requirements?
    // For now, consistent with previous behavior: load program if any task needs it (all new engine rules do)

    for (const batch of batches.values()) {
        try {
            if (!fileContent) fileContent = await context.readFile(tasks[0].filePath);
            if (!program) program = await context.getProgram(tasks[0].filePath);

            // Check if any rule in this batch needs template
            // We don't have easy access to rule metadata here to check `requires.template` 
            // without importing the registry or checking the task inputs.
            // Let's check task inputs for efficiency if available.
            // If inputs are not populated fully, we might fallback to checking file extension or just lazy load.

            // Existing logic replication:
            const needsTemplate = tasks.some(t => batch.taskIds.includes(t.taskId) && t.inputs.template?.needsAst);
            if (needsTemplate && !template) {
                template = await context.getTemplate(tasks[0].filePath);
            }

            const ruleContext: RuleContext = {
                filePath: tasks[0].filePath,
                fileContent,
                program,
                template, // Might be undefined if not needed/found
                options: batch.options,
            };

            const batchResults = executeBatchedNewEngineRules(batch.ruleNames, ruleContext);

            // 3. Map results back to task IDs
            const taskIdMap = new Map<string, string[]>();
            for (let i = 0; i < batch.ruleNames.length; i++) {
                const name = batch.ruleNames[i];
                const id = batch.taskIds[i];
                const ids = taskIdMap.get(name) ?? [];
                ids.push(id);
                taskIdMap.set(name, ids);
            }

            for (const result of batchResults) {
                const ids = taskIdMap.get(result.ruleName);

                // Override severity from configuration
                const configuredSeverity = batch.severities.get(result.ruleName);
                let finalResult = result;

                if (configuredSeverity) {
                    // Create new failures with overridden severity
                    const newFailures = result.failures.map(f => ({
                        ...f,
                        severity: configuredSeverity
                    }));

                    finalResult = {
                        ...result,
                        failures: newFailures
                    };
                }

                if (ids && ids.length > 0) {
                    const taskId = ids.shift();
                    results.push({ ...finalResult, taskId });
                } else {
                    results.push(finalResult);
                }
            }
        } catch (e) {
            error("engine", `Failed to execute batch for ${tasks[0].filePath}:`, e);
            // Fallback: Add all these as failed results
            for (let i = 0; i < batch.ruleNames.length; i++) {
                results.push({
                    ruleName: batch.ruleNames[i],
                    failures: [], // Or specific error failure?
                    taskId: batch.taskIds[i]
                });
            }
        }
    }

    return results;
};
