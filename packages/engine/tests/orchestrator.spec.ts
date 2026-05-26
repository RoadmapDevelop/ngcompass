import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runAnalysis } from '../src/orchestrator.js';
import { configureRuleExecutor } from '../src/rule-executor.js';
import type { Task, ExecutionPlanOutput } from '@ngcompass/planner';
import type { AnalysisResult, RuleResult } from '@ngcompass/common';

vi.mock('../src/rule-context-factory.js', () => ({
  RuleContextFactory: vi.fn().mockImplementation(() => ({
    build: vi.fn().mockResolvedValue({}),
  })),
}));

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    taskId: 'task-' + Math.random().toString(36).slice(2),
    ruleName: 'test-rule',
    filePath: '/fake/app.component.ts',
    severity: 'warning',
    options: {},
    inputs: {
      typescript: {
        path: '/fake/app.component.ts',
        hash: 'abc',
        needsAst: true,
      },
    },
    needsTypeChecker: false,
    needsProjectContext: false,
    ...overrides,
  } as Task;
}

function makeEmptyPlan(
  overrides: Partial<ExecutionPlanOutput> = {}
): ExecutionPlanOutput {
  return {
    tasks: [],
    skippedTasks: [],
    plan: { units: [] } as unknown as ExecutionPlanOutput['plan'],
    indexes: {} as unknown as ExecutionPlanOutput['indexes'],
    ...overrides,
  };
}

function makeValidAnalysisResult(
  overrides: Partial<AnalysisResult> = {}
): AnalysisResult {
  return {
    results: [],
    parseErrors: [],
    stats: {
      totalFiles: 0,
      totalErrors: 0,
      totalWarnings: 0,
      duration: 0,
      cacheHitRate: undefined,
    },
    ...overrides,
  };
}

beforeEach(() => {
  configureRuleExecutor(
    () => [],
    () => false
  );
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('runAnalysis — precomputed analysis', () => {
  it('returns the precomputed result immediately without executing tasks', async () => {
    const precomputed = makeValidAnalysisResult({
      results: [{ ruleName: 'cached-rule', failures: [] }],
    });
    const plan = makeEmptyPlan({ precomputedAnalysis: precomputed });

    const result = await runAnalysis(plan, { rootDir: '/fake' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.results[0].ruleName).toBe('cached-rule');
  });

  it('ignores precomputed analysis when it fails schema validation', async () => {
    const invalidPrecomputed = {
      results: [],
      parseErrors: [],
    } as unknown as AnalysisResult;
    const task = makeTask({ ruleName: 'unregistered' });
    const plan = makeEmptyPlan({
      tasks: [task],
      precomputedAnalysis: invalidPrecomputed,
    });

    const result = await runAnalysis(plan, { rootDir: '/fake' });

    expect(result.ok).toBe(true);
  });

  it('ignores precomputed analysis that is null/undefined', async () => {
    const plan = makeEmptyPlan({ precomputedAnalysis: undefined });
    const result = await runAnalysis(plan, { rootDir: '/fake' });
    expect(result.ok).toBe(true);
  });
});

describe('runAnalysis — empty plan', () => {
  it('returns Ok with empty results and valid stats for an empty plan', async () => {
    const plan = makeEmptyPlan();
    const result = await runAnalysis(plan, { rootDir: '/fake' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.results).toEqual([]);
    expect(result.data.parseErrors).toEqual([]);
    expect(typeof result.data.stats.totalFiles).toBe('number');
    expect(typeof result.data.stats.duration).toBe('number');
  });
});

describe('runAnalysis — local execution', () => {
  it('executes tasks and returns results', async () => {
    const task = makeTask({ ruleName: 'no-op-rule' });

    const plan = makeEmptyPlan({ tasks: [task] });

    const result = await runAnalysis(plan, {
      rootDir: '/fake',
      parallelThreshold: 9999,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.results).toHaveLength(1);
    expect(result.data.results[0].ruleName).toBe('no-op-rule');
  });

  it('merges executed results with skipped task cached results', async () => {
    const skippedTask = makeTask({
      ruleName: 'cached-rule',
      taskId: 'skipped-1',
    });
    const cachedResult: RuleResult = {
      ruleName: 'cached-rule',
      taskId: 'skipped-1',
      failures: [],
    };

    const plan = makeEmptyPlan({
      tasks: [],
      skippedTasks: [skippedTask],
      cachedResults: new Map([['skipped-1', cachedResult]]),
    });

    const result = await runAnalysis(plan, { rootDir: '/fake' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.results.some((r) => r.ruleName === 'cached-rule')).toBe(
      true
    );
  });

  it('handles multiple tasks for different files', async () => {
    const task1 = makeTask({ filePath: '/fake/a.ts', taskId: 'task-a' });
    const task2 = makeTask({ filePath: '/fake/b.ts', taskId: 'task-b' });
    const plan = makeEmptyPlan({ tasks: [task1, task2] });

    const result = await runAnalysis(plan, {
      rootDir: '/fake',
      parallelThreshold: 9999,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.results).toHaveLength(2);
  });

  it('emits file-level progress when each local file batch completes', async () => {
    const task1 = makeTask({ filePath: '/fake/a.ts', taskId: 'task-a' });
    const task2 = makeTask({ filePath: '/fake/b.ts', taskId: 'task-b' });
    const onFileProgress = vi.fn();
    const plan = makeEmptyPlan({ tasks: [task1, task2] });

    const result = await runAnalysis(plan, {
      rootDir: '/fake',
      parallelThreshold: 9999,
      onFileProgress,
    });

    expect(result.ok).toBe(true);
    expect(onFileProgress).toHaveBeenCalledTimes(2);
    expect(onFileProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        filePath: '/fake/a.ts',
        taskCount: 1,
        issueCount: 0,
      })
    );
    expect(onFileProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        filePath: '/fake/b.ts',
        taskCount: 1,
        issueCount: 0,
      })
    );
  });

  it('caches the final result when cache and globalHash are provided', async () => {
    const mockCache = {
      analysis: { set: vi.fn().mockResolvedValue(undefined), get: vi.fn() },
      results: { getMany: vi.fn().mockResolvedValue(new Map()), set: vi.fn() },
      files: { get: vi.fn(), set: vi.fn() },
      ast: { get: vi.fn(), set: vi.fn() },
      config: { get: vi.fn(), set: vi.fn() },
      meta: { get: vi.fn(), set: vi.fn() },
      plan: { get: vi.fn(), set: vi.fn() },
      source: { get: vi.fn(), set: vi.fn() },
      flush: vi.fn(),
      computeHash: vi.fn().mockReturnValue('hash-123'),
    };

    const plan = makeEmptyPlan({ globalHash: 'global-hash-abc' });

    await runAnalysis(plan, {
      rootDir: '/fake',
      cache: mockCache as unknown as Parameters<typeof runAnalysis>[1]['cache'],
    });

    expect(mockCache.analysis.set).toHaveBeenCalledWith(
      'global-hash-abc',
      expect.any(Object)
    );
  });
});

describe('runAnalysis — error handling', () => {
  it('returns Err when an unexpected exception occurs in the orchestration', async () => {
    const plan = null as unknown as ExecutionPlanOutput;

    const result = await runAnalysis(plan, { rootDir: '/fake' });
    expect(result.ok).toBe(false);
  });
});
