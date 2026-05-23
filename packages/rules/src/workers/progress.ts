/**
 * @fileoverview
 * Shared per-file progress message builder used by both worker entry points.
 *
 * `execution-worker.ts` and `type-aware-worker.ts` post identical
 * `WorkerFileProgress` messages to the parent (with `typeAware: false` and
 * `true` respectively). Centralizing the construction here keeps the IPC
 * payload shape in one place.
 */

import type { RuleResult, WorkerFileProgress } from '@ngcompass/common';

/**
 * Builds a `WorkerFileProgress` message from the per-file results plus the
 * elapsed duration.
 *
 * @param filePath  - Absolute path of the file that finished.
 * @param taskCount - Number of tasks that ran for the file.
 * @param results   - Result list produced by the engine for the file.
 * @param duration  - Wall-clock duration spent analysing the file (ms).
 * @param typeAware - `true` for the type-aware worker, `false` otherwise.
 */
export const buildWorkerFileProgress = (
    filePath: string,
    taskCount: number,
    results: ReadonlyArray<RuleResult>,
    duration: number,
    typeAware: boolean,
): WorkerFileProgress => {
    let errorCount = 0;
    let warningCount = 0;
    for (const result of results) {
        for (const failure of result.failures) {
            if (failure.severity === 'error') errorCount++;
            else if (failure.severity === 'warn') warningCount++;
        }
    }
    return {
        kind: 'file-progress',
        filePath,
        taskCount,
        issueCount: errorCount + warningCount,
        errorCount,
        warningCount,
        duration,
        typeAware,
    };
};
