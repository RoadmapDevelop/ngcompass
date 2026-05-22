/**
 * @fileoverview
 * Worker-thread entry point for parallel task building.
 *
 * The main planner thread spawns one of these per file chunk so very large
 * projects (typically 10 000+ files) parallelize the per-file
 * resource-discovery / hashing pipeline. Maps are passed in as serialized
 * entry arrays because Node's `structuredClone` does not preserve the
 * prototype chain of complex map values — the worker reconstructs the Maps
 * locally before invoking the shared builder.
 */

import { parentPort, workerData } from 'node:worker_threads';
import { initHasher } from '@ngcompass/cache';
import type { ConfigOverride, ResolvedRule } from '@ngcompass/common';
import { detectFileType } from './file-type.js';
import { resolveOverridesForFile } from './overrides.js';
import { buildTasksForFileTaskCentric, type TaskBuilderContext } from './task-builder.js';
import type { FileType, Task, TaskInputs } from './types.js';

/** Payload posted from the parent thread. */
export interface WorkerData {
    files: string[];
    /** Serialized `Map<string, ResolvedRule>` entries. */
    rulesEntries: [string, ResolvedRule][];
    /** Serialized `Map<string, FileType>` entries. */
    fileTypeCacheEntries?: [string, FileType][];
    /** Per-file rule overrides (plain JSON; safe across structured-clone). */
    overridesData?: ConfigOverride[];
}

/** Response posted back to the parent thread. */
export interface WorkerResult {
    tasks: Task[];
}

const main = async (): Promise<void> => {
    const port = parentPort;
    if (!port) return;

    try {
        const { files, rulesEntries, fileTypeCacheEntries, overridesData } = workerData as WorkerData;

        const rules = new Map<string, ResolvedRule>(rulesEntries);
        const fileTypeCache = fileTypeCacheEntries
            ? new Map<string, FileType>(fileTypeCacheEntries)
            : undefined;

        // Sanity check: structured-clone preserves data ⇒ entry count matches.
        if (rules.size !== rulesEntries.length) {
            throw new Error(
                `Map serialization round-trip failed: expected ${rulesEntries.length} rules, ` +
                `got ${rules.size}. Worker data may have been corrupted by structured-clone.`,
            );
        }

        await initHasher();

        const context: TaskBuilderContext = {
            hashCache: new Map<string, string>(),
            resourceCache: new Map<string, TaskInputs>(),
        };

        const tasks = await buildTasksForFiles(files, rules, fileTypeCache, context, overridesData);
        port.postMessage({ tasks } satisfies WorkerResult);
    } catch (error) {
        // Report an empty result first so the parent's "message" handler
        // resolves without hanging, then re-throw so the worker exits non-zero
        // and the parent's "exit" handler surfaces the failure.
        port.postMessage({ tasks: [] } satisfies WorkerResult);
        throw error;
    }
};

const buildTasksForFiles = async (
    files: ReadonlyArray<string>,
    rules: ReadonlyMap<string, ResolvedRule>,
    fileTypeCache: Map<string, FileType> | undefined,
    context: TaskBuilderContext,
    overrides?: ConfigOverride[],
): Promise<Task[]> => {
    const tasks: Task[] = [];
    for (const file of files) {
        const fileType = fileTypeCache?.get(file) ?? detectFileType(file);
        const fileRules = overrides?.length
            ? resolveOverridesForFile(file, rules, overrides)
            : rules;
        const fileTasks = await buildTasksForFileTaskCentric(file, fileType, fileRules, context);
        tasks.push(...fileTasks);
    }
    return tasks;
};

void main();
