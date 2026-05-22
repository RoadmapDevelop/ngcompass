/**
 * @fileoverview
 * Small task-list utilities shared by the planner.
 *
 * Hosts the one helper (`groupTasksByFile`) used by both the builder's
 * file-centric plan conversion and the index builder's task-by-file index.
 */

import type { Task } from './types.js';

/**
 * Groups a flat task list by file path.
 *
 * @param tasks - Flat list of tasks.
 * @returns Map keyed by `task.filePath` whose values are the tasks targeting
 *          that file, in their original order.
 */
export const groupTasksByFile = (tasks: ReadonlyArray<Task>): Map<string, Task[]> => {
    const map = new Map<string, Task[]>();
    for (const task of tasks) {
        const list = map.get(task.filePath);
        if (list) list.push(task);
        else map.set(task.filePath, [task]);
    }
    return map;
};
