/**
 * @fileoverview
 * Shared per-file progress utilities.
 *
 * Both the worker-pool and the orchestrator surface `AnalysisFileProgress`
 * events; the underlying counting logic (error / warning tallies) and the
 * worker-side type guard are identical and lived as duplicates in those two
 * modules. This file owns the canonical implementation.
 */

import type { RuleResult, WorkerFileProgress } from '@ngcompass/common';

/** Event emitted whenever every task for a single file finishes. */
export interface AnalysisFileProgress {
    readonly filePath: string;
    readonly taskCount: number;
    readonly issueCount: number;
    readonly errorCount: number;
    readonly warningCount: number;
    readonly duration: number;
    readonly cached?: boolean;
    readonly typeAware?: boolean;
}

/**
 * Builds an `AnalysisFileProgress` event by tallying error/warning failures
 * across `results`.
 *
 * @param filePath    - Absolute path of the file that finished.
 * @param taskCount   - Total number of tasks that ran for the file.
 * @param results     - Result list produced by the engine for the file.
 * @param duration    - Wall-clock duration spent analyzing the file (ms).
 * @param typeAware   - When `true`, marks the event as coming from the
 *                      type-aware execution path.
 */
export const buildFileProgress = (
    filePath: string,
    taskCount: number,
    results: ReadonlyArray<RuleResult>,
    duration: number,
    typeAware?: boolean,
): AnalysisFileProgress => {
    let errorCount = 0;
    let warningCount = 0;

    for (const result of results) {
        for (const failure of result.failures) {
            if (failure.severity === 'error') errorCount++;
            else if (failure.severity === 'warn') warningCount++;
        }
    }

    return {
        filePath,
        taskCount,
        issueCount: errorCount + warningCount,
        errorCount,
        warningCount,
        duration,
        typeAware,
    };
};

/**
 * Runtime guard for `WorkerFileProgress` messages posted from worker threads.
 * `WorkerFileProgress` is a subtype of `AnalysisFileProgress` distinguished
 * by `kind === 'file-progress'`.
 */
export const isWorkerFileProgress = (message: unknown): message is WorkerFileProgress => (
    !!message
    && typeof message === 'object'
    && (message as { kind?: unknown }).kind === 'file-progress'
);

/**
 * Stronger guard used by the child-process IPC path: validates every numeric
 * field so a malformed message can't be silently dropped on the floor.
 */
export const isAnalysisFileProgress = (message: unknown): message is AnalysisFileProgress => {
    if (!message || typeof message !== 'object') return false;
    const value = message as Partial<AnalysisFileProgress> & { kind?: unknown };
    return value.kind === 'file-progress'
        && typeof value.filePath === 'string'
        && typeof value.taskCount === 'number'
        && typeof value.issueCount === 'number'
        && typeof value.errorCount === 'number'
        && typeof value.warningCount === 'number'
        && typeof value.duration === 'number';
};
