/**
 * Unit Tests — worker-pool.ts  (runAnalysisParallel)
 *
 * Tests the local fallback path (exercised automatically in the test
 * environment because no compiled execution-worker.js is on the classpath
 * when running vitest from source).
 *
 * Also tests distributeTasks logic and runAnalysisParallel contract.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runAnalysisParallel } from '../src/worker-pool.js';
import { configureRuleExecutor } from '../src/rule-executor.js';
import type { Task } from '@ngcompass/planner';

// ---------------------------------------------------------------------------
// Mock RuleContextFactory so the fallback local execution is fast
// ---------------------------------------------------------------------------

vi.mock('../src/rule-context-factory.js', () => ({
    RuleContextFactory: vi.fn().mockImplementation(() => ({
        build: vi.fn().mockResolvedValue({}),
    })),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let taskCounter = 0;

function makeTask(filePath = '/fake/app.component.ts', overrides: Partial<Task> = {}): Task {
    return {
        taskId: `task-${++taskCounter}`,
        ruleName: 'no-op-rule',
        filePath,
        severity: 'warning',
        options: {},
        inputs: {
            typescript: { path: filePath, hash: 'hash-' + taskCounter, needsAst: false },
        },
        needsTypeChecker: false,
        needsProjectContext: false,
        ...overrides,
    } as Task;
}

beforeEach(() => {
    taskCounter = 0;
    // No rules registered → runner records empty-failures results instantly
    configureRuleExecutor(() => [], () => false);
});

afterEach(() => {
    vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Contract: always returns Ok<AnalysisResult>
// ---------------------------------------------------------------------------

describe('runAnalysisParallel — contract', () => {
    it('returns Ok with an empty result when tasks array is empty', async () => {
        const result = await runAnalysisParallel([], '/fake', Date.now());
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.data.results).toEqual([]);
        expect(result.data.parseErrors).toEqual([]);
    });

    it('returns Ok for a single task (no-op rule)', async () => {
        const task = makeTask();
        const result = await runAnalysisParallel([task], '/fake', Date.now());
        expect(result.ok).toBe(true);
    });

    it('returns Ok for multiple tasks across different files', async () => {
        const tasks = [
            makeTask('/fake/a.ts'),
            makeTask('/fake/b.ts'),
            makeTask('/fake/c.ts'),
        ];
        const result = await runAnalysisParallel(tasks, '/fake', performance.now());
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        // One result per task (empty failures for unregistered rules)
        expect(result.data.results).toHaveLength(3);
    });

    it('includes valid stats in the result', async () => {
        const task = makeTask();
        // Must use performance.now() — calculateStats computes duration as
        // performance.now() - startTime, so they must share the same time origin.
        const start = performance.now();
        const result = await runAnalysisParallel([task], '/fake', start);
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(typeof result.data.stats.totalFiles).toBe('number');
        expect(typeof result.data.stats.duration).toBe('number');
        expect(result.data.stats.duration).toBeGreaterThanOrEqual(0);
    });
});

// ---------------------------------------------------------------------------
// Local fallback: multiple tasks for the same file collapse into one batch
// ---------------------------------------------------------------------------

describe('runAnalysisParallel — same-file task grouping', () => {
    it('handles multiple tasks targeting the same file', async () => {
        const filePath = '/fake/shared.component.ts';
        const tasks = [
            makeTask(filePath, { ruleName: 'rule-a' }),
            makeTask(filePath, { ruleName: 'rule-b' }),
            makeTask(filePath, { ruleName: 'rule-c' }),
        ];
        const result = await runAnalysisParallel(tasks, '/fake', performance.now());
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.data.results).toHaveLength(3);
    });
});

// ---------------------------------------------------------------------------
// Result shape: results are always arrays of RuleResult objects
// ---------------------------------------------------------------------------

describe('runAnalysisParallel — result shape', () => {
    it('every result has ruleName and failures array', async () => {
        const tasks = [makeTask('/fake/a.ts'), makeTask('/fake/b.ts')];
        const result = await runAnalysisParallel(tasks, '/fake', performance.now());
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        for (const r of result.data.results) {
            expect(typeof r.ruleName).toBe('string');
            expect(Array.isArray(r.failures)).toBe(true);
        }
    });

    it('parseErrors array is always present', async () => {
        const result = await runAnalysisParallel([makeTask()], '/fake', performance.now());
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(Array.isArray(result.data.parseErrors)).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// Concurrency: maxWorkers and concurrency params are accepted without error
// ---------------------------------------------------------------------------

describe('runAnalysisParallel — concurrency params', () => {
    it('accepts maxWorkers=1 without error', async () => {
        const result = await runAnalysisParallel([makeTask()], '/fake', performance.now(), 1);
        expect(result.ok).toBe(true);
    });

    it('accepts maxWorkers=4 without error', async () => {
        const tasks = Array.from({ length: 4 }, (_, i) => makeTask(`/fake/file-${i}.ts`));
        const result = await runAnalysisParallel(tasks, '/fake', performance.now(), 4);
        expect(result.ok).toBe(true);
    });
});
