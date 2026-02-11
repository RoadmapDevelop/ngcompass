import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runAnalysis } from '../../src/engine/orchestrator.js';
import { Task } from '../../src/planner/types.js';

// Mock Worker
const mockWorker = {
    on: vi.fn((event, callback) => {
        if (event === 'message') {
            // Simulate success asynchronously to match real behavior
            setTimeout(() => {
                callback({ results: [], errors: [] });
            }, 0);
        }
    }),
    postMessage: vi.fn(),
    terminate: vi.fn(),
};

// Mock node:worker_threads
vi.mock('node:worker_threads', () => ({
    Worker: vi.fn(() => mockWorker),
    parentPort: {},
    workerData: {},
}));

// Mock node:fs to bypass worker path check
vi.mock('node:fs', () => ({
    existsSync: vi.fn(() => true),
    readFile: vi.fn(),
}));

// Mock os to control CPU count
vi.mock('node:os', () => ({
    cpus: () => new Array(4).fill({}), // Mock 4 cores
}));

// Mock process.stdout.write to avoid spinner noise
vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

describe('Orchestrator Task Distribution', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should group tasks by file when distributing to workers', async () => {
        // Create tasks for 3 files
        const tasks: Task[] = [];
        const files = ['/a.ts', '/b.ts', '/c.ts'];
        const taskCounts = [90, 60, 30]; // Total 180 tasks, triggers parallel mode (>150)

        files.forEach((file, index) => {
            const count = taskCounts[index];
            for (let i = 0; i < count; i++) {
                tasks.push({
                    taskId: `${file}-task-${i}`,
                    ruleName: 'rule',
                    filePath: file,
                    severity: 'error',
                    options: {},
                    inputs: {
                        typescript: { path: file, hash: '', needsAst: true }
                    }
                } as any);
            }
        });

        await runAnalysis({
            tasks,
            skippedTasks: [],
            plan: {} as any, // Mock unused parts
            indexes: {} as any
        }, { rootDir: '/root' });

        // Check Worker assertions
        const { Worker } = await import('node:worker_threads');
        expect(Worker).toHaveBeenCalled();

        // Get all worker calls
        const calls = (Worker as any).mock.calls;

        // Verify each worker received tasks grouped by file
        // We expect specifically that for any given worker, if it has tasks for file X, 
        // it should have ALL tasks for file X.

        const allWorkerTasks = calls.map((call: any) => call[1].workerData.tasks as Task[]);

        // Flatten to check we processed everything
        const processedTasks = allWorkerTasks.flat();
        expect(processedTasks.length).toBe(180);

        // Verify grouping integrity
        for (const workerTasks of allWorkerTasks) {
            const filesInWorker = new Set(workerTasks.map((t: Task) => t.filePath));

            for (const file of filesInWorker) {
                // Count tasks for this file in this worker
                const tasksForFileInWorker = workerTasks.filter((t: Task) => t.filePath === file).length;

                // Should match total tasks for that file (meaning no split)
                const expectedCount = taskCounts[files.indexOf(file as string)];
                expect(tasksForFileInWorker).toBe(expectedCount);
            }
        }
    });
});
