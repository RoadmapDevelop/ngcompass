import { parentPort, workerData } from "node:worker_threads";
import { buildTasksForFileTaskCentric, type TaskBuilderContext } from "./task-builder.js";
import { detectFileType } from "./file-type.js";
import type { FileType, Task, TaskInputs } from "./types.js";
import { ResolvedRule } from "@ngcompass/common";
import { initHasher } from "@ngcompass/cache";

/**
 * Worker input payload.
 *
 * Rules and fileTypeCache are transmitted as serialized entry arrays rather
 * than Map instances because Node.js structured-clone does not preserve Map
 * entries containing complex objects (prototype chains are stripped).
 * The worker reconstructs the Maps from the entries.
 */
export interface WorkerData {
    files: string[];
    /** Serialized Map<string, ResolvedRule> entries */
    rulesEntries: [string, ResolvedRule][];
    /** Serialized Map<string, FileType> entries (optional) */
    fileTypeCacheEntries?: [string, FileType][];
}

/**
 * Worker output payload.
 */
export interface WorkerResult {
    tasks: Task[];
}

const main = async (): Promise<void> => {
    const port = parentPort;
    if (!port) return;

    try {
        const { files, rulesEntries, fileTypeCacheEntries } = workerData as WorkerData;

        // Reconstruct Maps from serialized entries.
        const rules = new Map<string, ResolvedRule>(rulesEntries);
        const fileTypeCache = fileTypeCacheEntries
            ? new Map<string, FileType>(fileTypeCacheEntries)
            : undefined;

        // Validate that structured-clone preserved all rule entries. A size
        // mismatch indicates prototype-chain loss or data truncation — both of
        // which would silently produce incorrect task lists.
        if (rules.size !== rulesEntries.length) {
            throw new Error(
                `Map serialization round-trip failed: expected ${rulesEntries.length} rules, ` +
                `got ${rules.size}. Worker data may have been corrupted by structured-clone.`
            );
        }

        await initHasher();

        const context: TaskBuilderContext = {
            hashCache: new Map<string, string>(),
            resourceCache: new Map<string, TaskInputs>(),
        };

        const tasks = await buildTasksForFiles(files, rules, fileTypeCache, context);

        port.postMessage({ tasks } satisfies WorkerResult);
    } catch (error) {
        // Report the error before exiting so the parent can log it.
        port.postMessage({ tasks: [] } satisfies WorkerResult);
        // Re-throw so the worker process exits with a non-zero code, which
        // triggers the "exit" handler in the parent and surfaces the failure.
        throw error;
    }
};

const buildTasksForFiles = async (
    files: ReadonlyArray<string>,
    rules: ReadonlyMap<string, ResolvedRule>,
    fileTypeCache: Map<string, FileType> | undefined,
    context: TaskBuilderContext
): Promise<Task[]> => {
    const tasks: Task[] = [];

    for (const file of files) {
        const fileType = fileTypeCache?.get(file) ?? detectFileType(file);
        const fileTasks = await buildTasksForFileTaskCentric(file, fileType, rules, context);
        tasks.push(...fileTasks);
    }

    return tasks;
};

void main();
