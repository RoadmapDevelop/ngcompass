import type { Task } from "./types.js";

/**
 * Groups tasks by file path.
 *
 * @param tasks - Flat list of tasks
 * @returns Map keyed by file path
 */
export const groupTasksByFile = (tasks: ReadonlyArray<Task>): Map<string, Task[]> => {
    const map = new Map<string, Task[]>();

    for (const task of tasks) {
        const list = map.get(task.filePath);
        if (list) {
            list.push(task);
        } else {
            map.set(task.filePath, [task]);
        }
    }

    return map;
};
