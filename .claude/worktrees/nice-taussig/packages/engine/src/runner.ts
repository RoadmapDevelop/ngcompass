/**
 * @fileoverview
 * Provides the core execution runner for ngcompass.
 *
 * This module consolidates the rule execution logic utilized by both local
 * sequential processes and worker-based parallel execution. It manages task
 * batching, result mapping, and operational error handling.
 */


import { InfrastructureErrorCollector, RuleResult, RuleFailure, RuleSeverity, stableSerialize, SerializationError, createInfrastructureError, debug } from "@ngcompass/common";
import { Task } from "@ngcompass/planner";

import { RuleContextFactory, type ExecutionContext } from "./rule-context-factory.js";
import { getConfiguredExecutor, getConfiguredChecker } from "./rule-executor.js";




/**
 * Executes a collection of analysis tasks for a specific file.
 *
 * Processes tasks by grouping them into optimized execution batches. Utilizes
 * the RuleContextFactory for resource initialization and coordinates with
 * the configured rule executor for evaluation.
 *
 * @param tasks A collection of tasks to execute against a single file path.
 * @param context The operational context providing resource access.
 * @param errorCollector An optional sink for operational error reporting.
 * @returns A promise resolving to a collection of rule execution results.
 */
export const executeBatchedTasks = async (
    tasks: ReadonlyArray<Task>,
    context: ExecutionContext,
    errorCollector?: InfrastructureErrorCollector
): Promise<RuleResult[]> => {
    if (tasks.length === 0) return [];

    const filePath = tasks[0].filePath;
    const factory = new RuleContextFactory(context);

    const batches = new Map<string, {
        options: Record<string, unknown>,
        ruleNames: string[],
        taskIds: string[],
        severities: Map<string, RuleSeverity>
    }>();
    const results: RuleResult[] = [];

    for (const task of tasks) {
        if (!getConfiguredChecker()(task.ruleName)) {
            debug("engine", `Skipping task ${task.taskId}: Rule "${task.ruleName}" not registered in engine.`);
            results.push({ ruleName: task.ruleName, taskId: task.taskId, failures: [] });
            continue;
        }

        let optionsKey: string;
        try {
            optionsKey = stableSerialize(task.options || {});
        } catch (serErr) {
            const msg = serErr instanceof SerializationError ? serErr.message : String(serErr);
            debug("engine", `Skipping task ${task.taskId}: failed to serialize options — ${msg}`);
            errorCollector?.record(createInfrastructureError('SerializationError', {
                cause: msg,
                phase: 'engine',
                recoverable: true,
            }));
            results.push({ ruleName: task.ruleName, taskId: task.taskId, failures: [] });
            continue;
        }
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

    for (const batch of batches.values()) {
        try {
            const batchTaskIdSet = new Set(batch.taskIds);
            const needsTemplate = tasks.some(
                t => batchTaskIdSet.has(t.taskId) && t.inputs.template?.needsAst
            );

            const ruleContext = await factory.build(
                filePath,
                batch.options,
                needsTemplate,
            );

            const batchResults = getConfiguredExecutor()(batch.ruleNames, ruleContext);

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

                const finalResult = configuredSeverity
                    ? {
                        ...result,
                        failures: result.failures.map((f: RuleFailure): RuleFailure => ({ ...f, severity: configuredSeverity })),
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
            const msg = e instanceof Error ? e.message : String(e);
            debug("engine", `Failed to execute batch for ${filePath}: ${msg}`);
            errorCollector?.record(createInfrastructureError('ParseError', {
                filePath,
                cause: msg,
                phase: 'engine',
                recoverable: true,
            }));
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

