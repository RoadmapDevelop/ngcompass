import { parentPort, workerData } from "node:worker_threads";
import { buildTasksForFileTaskCentric, type TaskBuilderContext } from "./task-builder.js";
import { detectFileType } from "./file-type.js";
import { initHasher } from "./hashing.js";
import type { FileType, Task, TaskInputs } from "./types.js";
import type { ResolvedRule } from "../rules/types.js";

/**
 * Worker input payload.
 */
export interface WorkerData {
    files: string[];
    rules: Map<string, ResolvedRule>;
    fileTypeCache?: Map<string, FileType>;
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
        const { files, rules, fileTypeCache } = workerData as WorkerData;

        await initHasher();

        const context: TaskBuilderContext = {
            hashCache: new Map<string, string>(),
            resourceCache: new Map<string, TaskInputs>(),
        };

        const tasks = await buildTasksForFiles(files, rules, fileTypeCache, context);

        port.postMessage({ tasks } satisfies WorkerResult);
    } catch (error) {
        port.postMessage({ tasks: [] } satisfies WorkerResult);
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
