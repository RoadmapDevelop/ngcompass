/**
 * Shared Execution Runner
 *
 * Consolidates rule execution logic shared between the orchestrator (local/sequential)
 * and the execution worker (parallel).
 *
 * Context construction is delegated to RuleContextFactory — runner.ts is now
 * responsible only for batching by options and mapping results back to task IDs.
 */

import { Task } from "../planner/index.js";
import { RuleResult, RuleSeverity } from "../rules/types.js";
import { error, warn } from "@ngcompass/common";
import { isNewEngineRule, executeBatchedNewEngineRules } from "../rules/engine/adapter.js";
import { RuleContextFactory } from "../rules/engine/rule-context-factory.js";
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
 * Context construction (file read, AST parse, Locator creation) is handled by
 * RuleContextFactory — this function focuses on grouping tasks by options and
 * mapping engine results back to their task IDs.
 *
 * @param tasks   - Tasks to execute (MUST all be for the same file)
 * @param context - Execution context (provides file access, parsing)
 * @returns Array of RuleResults
 */
export const executeBatchedTasks = async (
    tasks: ReadonlyArray<Task>,
    context: ExecutionContext
): Promise<RuleResult[]> => {
    if (tasks.length === 0) return [];

    const factory = new RuleContextFactory(context);

    // 1. Group tasks by options key and filter for known engine rules
    const batches = new Map<string, {
        options: Record<string, unknown>,
        ruleNames: string[],
        taskIds: string[],
        severities: Map<string, RuleSeverity>
    }>();
    const results: RuleResult[] = [];

    for (const task of tasks) {
        if (!isNewEngineRule(task.ruleName)) {
            warn("engine", `Skipping task ${task.taskId}: Rule "${task.ruleName}" not registered in engine.`);
            results.push({ ruleName: task.ruleName, taskId: task.taskId, failures: [] });
            continue;
        }

        const optionsKey = JSON.stringify(task.options || {});
        const batch = batches.get(optionsKey) ?? {
            options: task.options as Record<string, unknown>,
            ruleNames: [] as string[],
            taskIds: [] as string[],
            severities: new Map<string, RuleSeverity>()
        };
        batch.ruleNames.push(task.ruleName);
        batch.taskIds.push(task.taskId);
        batch.severities.set(task.ruleName, task.severity);
        batches.set(optionsKey, batch);
    }

    // 2. Execute each batch — all tasks in a batch share the same file + options
    for (const batch of batches.values()) {
        try {
            // Determine if any task in this batch requires the template
            const needsTemplate = tasks.some(
                t => batch.taskIds.includes(t.taskId) && t.inputs.template?.needsAst
            );

            // RuleContextFactory handles all I/O: read, parse, Locator, template
            const ruleContext = await factory.build(
                tasks[0].filePath,
                batch.options,
                needsTemplate,
            );

            // Single-pass execution across all rules in this batch
            const batchResults = executeBatchedNewEngineRules(batch.ruleNames, ruleContext);

            // 3. Map results back to task IDs and apply configured severity
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
                const configuredSeverity = batch.severities.get(result.ruleName);

                // Override per-failure severity from the config (user-specified level)
                const finalResult = configuredSeverity
                    ? {
                        ...result,
                        failures: result.failures.map(f => ({ ...f, severity: configuredSeverity })),
                    }
                    : result;

                if (ids && ids.length > 0) {
                    const taskId = ids.shift();
                    results.push({ ...finalResult, taskId });
                } else {
                    results.push(finalResult);
                }
            }
        } catch (e) {
            error("engine", `Failed to execute batch for ${tasks[0].filePath}:`, e);
            // Produce empty results for all tasks in the failed batch
            for (let i = 0; i < batch.ruleNames.length; i++) {
                results.push({
                    ruleName: batch.ruleNames[i],
                    failures: [],
                    taskId: batch.taskIds[i]
                });
            }
        }
    }

    return results;
};
