import { parentPort, workerData } from 'node:worker_threads';
import { buildTasksForFileTaskCentric, type TaskBuilderContext } from './task-builder.js';
import { detectFileType } from './file-type.js';
import { initHasher } from './hashing.js';
import type { FileType, Task, TaskInputs } from './types.js';
import type { ResolvedRule } from '../rules/types.js';

/**
 * Worker Input Data
 */
export interface WorkerData {
    files: string[];
    rules: Map<string, ResolvedRule>;
    fileTypeCache?: Map<string, FileType>;
}

/**
 * Worker Output Data
 */
export interface WorkerResult {
    tasks: Task[];
}

const run = async () => {
    try {
        const { files, rules, fileTypeCache } = workerData as WorkerData;

        // Initialize xxhash WASM inside the worker (each worker has its own V8)
        await initHasher();

        // Create LOCAL caches for this worker's file chunk.
        // This eliminates redundant readFileSync + hash per rule for the same file.
        // Each file in this chunk is read+hashed only ONCE, then reused across all matching rules.
        const context: TaskBuilderContext = {
            hashCache: new Map<string, string>(),
            resourceCache: new Map<string, TaskInputs>(),
        };

        const tasks: Task[] = [];

        for (const file of files) {
            // Detect file type (use passed cache or compute)
            const fileType = fileTypeCache?.get(file) ?? detectFileType(file);

            // Build all tasks for this file with caching context
            const fileTasks = await buildTasksForFileTaskCentric(
                file,
                fileType,
                rules,
                context
            );

            tasks.push(...fileTasks);
        }

        if (parentPort) {
            parentPort.postMessage({ tasks });
        }
    } catch (error) {
        console.error('Worker error:', error);
        throw error;
    }
};

run();
