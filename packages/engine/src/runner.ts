/**
 * @fileoverview
 * Batched task execution for a single file.
 *
 * Groups every task that shares an `options` payload into one batch so a
 * single AST pass produces results for all rules in that batch. Failures
 * thrown by individual rules are intercepted, recorded against the
 * supplied error collector, and surfaced as empty result entries so the
 * outer orchestrator never has to handle a partial-failure state.
 */

import {
    createInfrastructureError,
    debug,
    InfrastructureErrorCollector,
    RuleFailure,
    RuleResult,
    RuleSeverity,
    SerializationError,
    stableSerialize,
} from '@ngcompass/common';
import type { Task } from '@ngcompass/planner';

import { RuleContextFactory, type ExecutionContext } from './rule-context-factory.js';
import { getConfiguredChecker, getConfiguredExecutor } from './rule-executor.js';

/** Internal representation of a same-options task batch. */
interface TaskBatch {
    options: Record<string, unknown>;
    ruleNames: string[];
    taskIds: string[];
    severities: Map<string, RuleSeverity>;
}

/**
 * Executes every task in `tasks` (assumed to target the same file). Tasks
 * sharing identical options are grouped so the engine performs a single
 * AST pass per batch.
 *
 * @param tasks          - Tasks for one file.
 * @param context        - Execution context providing file/AST accessors.
 * @param errorCollector - Optional sink for non-fatal infrastructure errors.
 * @returns A flat list of `RuleResult`s, one per task.
 */
export const executeBatchedTasks = async (
    tasks: ReadonlyArray<Task>,
    context: ExecutionContext,
    errorCollector?: InfrastructureErrorCollector,
): Promise<RuleResult[]> => {
    if (tasks.length === 0) return [];

    const filePath = tasks[0].filePath;
    const factory = new RuleContextFactory(context);
    const batches = new Map<string, TaskBatch>();
    const results: RuleResult[] = [];

    for (const task of tasks) {
        if (!getConfiguredChecker()(task.ruleName)) {
            debug('engine', `Skipping task ${task.taskId}: Rule "${task.ruleName}" not registered in engine.`);
            results.push({ ruleName: task.ruleName, taskId: task.taskId, failures: [] });
            continue;
        }

        const optionsKey = serializeOptions(task, errorCollector);
        if (optionsKey === null) {
            results.push({ ruleName: task.ruleName, taskId: task.taskId, failures: [] });
            continue;
        }

        const batch = batches.get(optionsKey) ?? createBatch(task.options as Record<string, unknown>);
        batch.ruleNames.push(task.ruleName);
        batch.taskIds.push(task.taskId);
        batch.severities.set(task.ruleName, task.severity);
        batches.set(optionsKey, batch);
    }

    for (const batch of batches.values()) {
        const batchResults = await runBatch(batch, tasks, filePath, factory, errorCollector);
        results.push(...batchResults);
    }

    return results;
};

// ── Internal helpers ──────────────────────────────────────────────────────

const createBatch = (options: Record<string, unknown>): TaskBatch => ({
    options,
    ruleNames: [],
    taskIds: [],
    severities: new Map(),
});

/**
 * Serializes `task.options` into a stable key. Returns `null` and records
 * an infrastructure error when serialization throws (e.g. circular ref).
 */
const serializeOptions = (
    task: Task,
    errorCollector: InfrastructureErrorCollector | undefined,
): string | null => {
    try {
        return stableSerialize(task.options || {});
    } catch (serErr) {
        const msg = serErr instanceof SerializationError ? serErr.message : String(serErr);
        debug('engine', `Skipping task ${task.taskId}: failed to serialize options — ${msg}`);
        errorCollector?.record(
            createInfrastructureError('SerializationError', {
                cause: msg,
                phase: 'engine',
                recoverable: true,
            }),
        );
        return null;
    }
};

/**
 * Executes a single batch, building the shared rule context once and
 * fanning results back out to the individual task IDs.
 */
const runBatch = async (
    batch: TaskBatch,
    tasks: ReadonlyArray<Task>,
    filePath: string,
    factory: RuleContextFactory,
    errorCollector: InfrastructureErrorCollector | undefined,
): Promise<RuleResult[]> => {
    try {
        const batchTaskIdSet = new Set(batch.taskIds);
        const needsTemplate = tasks.some(
            (t) => batchTaskIdSet.has(t.taskId) && t.inputs.template?.needsAst,
        );

        const ruleContext = await factory.build(filePath, batch.options, needsTemplate);
        const batchResults = getConfiguredExecutor()(batch.ruleNames, ruleContext);

        return mapBatchResults(batch, batchResults);
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        debug('engine', `Failed to execute batch for ${filePath}: ${msg}`);
        errorCollector?.record(
            createInfrastructureError('ParseError', {
                filePath,
                cause: msg,
                phase: 'engine',
                recoverable: true,
            }),
        );
        return batch.ruleNames.map((ruleName, i) => ({
            ruleName,
            failures: [],
            taskId: batch.taskIds[i],
        }));
    }
};

/**
 * Maps the executor's batch output back to one `RuleResult` per task. Uses
 * an index cursor (not `Array.shift`) so the mapping stays linear when a
 * single rule name appears many times in the same batch.
 */
const mapBatchResults = (
    batch: TaskBatch,
    batchResults: ReadonlyArray<RuleResult>,
): RuleResult[] => {
    const taskIdsByRule = new Map<string, { ids: string[]; cursor: number }>();
    for (let i = 0; i < batch.ruleNames.length; i++) {
        const name = batch.ruleNames[i];
        const entry = taskIdsByRule.get(name);
        if (entry) entry.ids.push(batch.taskIds[i]);
        else taskIdsByRule.set(name, { ids: [batch.taskIds[i]], cursor: 0 });
    }

    const mapped: RuleResult[] = [];
    for (const result of batchResults) {
        const configuredSeverity = batch.severities.get(result.ruleName);
        const finalResult = configuredSeverity
            ? {
                ...result,
                failures: result.failures.map((f: RuleFailure): RuleFailure => ({
                    ...f,
                    severity: configuredSeverity,
                })),
            }
            : result;

        const entry = taskIdsByRule.get(result.ruleName);
        if (entry && entry.cursor < entry.ids.length) {
            mapped.push({ ...finalResult, taskId: entry.ids[entry.cursor++] });
        } else {
            mapped.push(finalResult);
        }
    }
    return mapped;
};
