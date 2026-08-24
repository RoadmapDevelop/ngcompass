import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runAnalysisParallel } from '../../src/execution/worker-pool.js';
import { configureRuleExecutor } from '../../src/execution/rule-executor.js';
import type { Task } from '@ngcompass/planner';

vi.mock('../src/rule-context-factory.js', () => ({
  RuleContextFactory: vi.fn().mockImplementation(() => ({
    build: vi.fn().mockResolvedValue({}),
  })),
}));

let taskCounter = 0;

function makeTask(
  filePath = '/fake/app.component.ts',
  overrides: Partial<Task> = {}
): Task {
  return {
    taskId: `task-${++taskCounter}`,
    ruleName: 'no-op-rule',
    filePath,
    severity: 'warning',
    options: {},
    inputs: {
      typescript: {
        path: filePath,
        hash: 'hash-' + taskCounter,
        needsAst: false,
      },
    },
    needsTypeChecker: false,
    needsProjectContext: false,
    ...overrides,
  } as Task;
}

beforeEach(() => {
  taskCounter = 0;

  configureRuleExecutor(
    () => [],
    () => false
  );
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('runAnalysisParallel — contract', { timeout: 30000 }, () => {
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

    expect(result.data.results).toHaveLength(3);
  });

  it('includes valid stats in the result', async () => {
    const task = makeTask();

    const start = performance.now();
    const result = await runAnalysisParallel([task], '/fake', start);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(typeof result.data.stats.totalFiles).toBe('number');
    expect(typeof result.data.stats.duration).toBe('number');
    expect(result.data.stats.duration).toBeGreaterThanOrEqual(0);
  });
});

describe('runAnalysisParallel — same-file task grouping', { timeout: 30000 }, () => {
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

describe('runAnalysisParallel — result shape', { timeout: 30000 }, () => {
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
    const result = await runAnalysisParallel(
      [makeTask()],
      '/fake',
      performance.now()
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Array.isArray(result.data.parseErrors)).toBe(true);
  });
});

describe('runAnalysisParallel — concurrency params', { timeout: 30000 }, () => {
  it('accepts maxWorkers=1 without error', async () => {
    const result = await runAnalysisParallel(
      [makeTask()],
      '/fake',
      performance.now(),
      1
    );
    expect(result.ok).toBe(true);
  });

  it('accepts maxWorkers=4 without error', async () => {
    const tasks = Array.from({ length: 4 }, (_, i) =>
      makeTask(`/fake/file-${i}.ts`)
    );
    const result = await runAnalysisParallel(
      tasks,
      '/fake',
      performance.now(),
      4
    );
    expect(result.ok).toBe(true);
  });
});
