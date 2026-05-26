import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { executeBatchedTasks } from '../src/runner.js';
import { configureRuleExecutor } from '../src/rule-executor.js';
import type { ExecutionContext } from '../src/rule-context-factory.js';
import type { Task } from '@ngcompass/planner';

vi.mock('../src/rule-context-factory.js', () => {
  const MockRuleContextFactory = vi.fn().mockImplementation(() => ({
    build: vi.fn().mockResolvedValue({
      filePath: '/fake/app.component.ts',
      program: null,
      options: {},
      sourceFile: null,
      template: undefined,
      style: undefined,
    } as unknown),
  }));
  return { RuleContextFactory: MockRuleContextFactory };
});

const mockContext: ExecutionContext = {
  rootDir: '/test',
  readFile: vi.fn().mockResolvedValue(''),
  getProgram: vi.fn().mockResolvedValue(null),
  getTemplate: vi.fn().mockResolvedValue(undefined),
  getStyle: vi.fn().mockResolvedValue(undefined),
  evict: vi.fn(),
};

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
        hash: 'abc123',
        needsAst: true,
      },
    },
    needsTypeChecker: false,
    needsProjectContext: false,
    ...overrides,
  } as Task;
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

describe('executeBatchedTasks — empty input', () => {
  it('returns an empty array immediately when tasks is empty', async () => {
    const results = await executeBatchedTasks([], mockContext);
    expect(results).toEqual([]);
  });
});

describe('executeBatchedTasks — unregistered rules', () => {
  it('returns an empty-failures result for an unregistered rule', async () => {
    const task = makeTask({ ruleName: 'not-registered' });
    const results = await executeBatchedTasks([task], mockContext);

    expect(results).toHaveLength(1);
    expect(results[0].ruleName).toBe('not-registered');
    expect(results[0].failures).toEqual([]);
  });

  it('preserves the taskId when the rule is unregistered', async () => {
    const task = makeTask({ ruleName: 'unknown', taskId: 'my-task-id' });
    const results = await executeBatchedTasks([task], mockContext);

    expect(results[0].taskId).toBe('my-task-id');
  });

  it('handles multiple unregistered tasks for the same file', async () => {
    const tasks = [
      makeTask({ ruleName: 'rule-a', taskId: 'id-a' }),
      makeTask({ ruleName: 'rule-b', taskId: 'id-b' }),
    ];
    const results = await executeBatchedTasks(tasks, mockContext);

    expect(results).toHaveLength(2);
    const names = results.map((r) => r.ruleName);
    expect(names).toContain('rule-a');
    expect(names).toContain('rule-b');
  });
});

describe('executeBatchedTasks — registered rules', () => {
  it('calls the configured executor and returns its results', async () => {
    const mockFailure = {
      filePath: '/fake/app.component.ts',
      line: 10,
      column: 5,
      message: 'Test failure',
      severity: 'warning' as const,
      ruleId: 'test-rule',
    };

    configureRuleExecutor(
      (_ruleNames, _ctx) => [
        { ruleName: 'test-rule', failures: [mockFailure] },
      ],
      (name) => name === 'test-rule'
    );

    const task = makeTask({ ruleName: 'test-rule', taskId: 'task-exec' });
    const results = await executeBatchedTasks([task], mockContext);

    expect(results).toHaveLength(1);
    expect(results[0].ruleName).toBe('test-rule');
    expect(results[0].failures).toHaveLength(1);
    expect(results[0].failures[0].message).toBe('Test failure');
  });

  it('overrides failure severity with the task-configured severity', async () => {
    configureRuleExecutor(
      (_ruleNames, _ctx) => [
        {
          ruleName: 'severity-rule',
          failures: [
            {
              filePath: '/fake/app.component.ts',
              line: 1,
              column: 1,
              message: 'msg',
              severity: 'warning' as const,
              ruleId: 'severity-rule',
            },
          ],
        },
      ],
      (name) => name === 'severity-rule'
    );

    const task = makeTask({ ruleName: 'severity-rule', severity: 'error' });
    const results = await executeBatchedTasks([task], mockContext);

    expect(results[0].failures[0].severity).toBe('error');
  });

  it('returns empty failures when executor returns no failures', async () => {
    configureRuleExecutor(
      () => [{ ruleName: 'clean-rule', failures: [] }],
      () => true
    );

    const task = makeTask({ ruleName: 'clean-rule' });
    const results = await executeBatchedTasks([task], mockContext);

    expect(results[0].failures).toHaveLength(0);
  });
});

describe('executeBatchedTasks — serialization errors', () => {
  it('returns empty failures when task options cannot be serialized', async () => {
    configureRuleExecutor(
      () => [],
      () => true
    );

    const circular: Record<string, unknown> = {};
    circular['self'] = circular;

    const task = makeTask({ options: circular });
    const results = await executeBatchedTasks([task], mockContext);

    expect(results).toHaveLength(1);
    expect(results[0].failures).toEqual([]);
  });
});

describe('executeBatchedTasks — batch-level errors', () => {
  it('returns empty failures when the executor throws', async () => {
    configureRuleExecutor(
      () => {
        throw new Error('Executor error');
      },
      () => true
    );

    const task = makeTask({ ruleName: 'error-rule', taskId: 'err-task' });
    const results = await executeBatchedTasks([task], mockContext);

    expect(results).toHaveLength(1);
    expect(results[0].ruleName).toBe('error-rule');
    expect(results[0].failures).toEqual([]);
  });

  it('continues processing after a batch error', async () => {
    let callCount = 0;
    configureRuleExecutor(
      (ruleNames) => {
        callCount++;
        if (callCount === 1) throw new Error('Executor error');
        return ruleNames.map((name) => ({ ruleName: name, failures: [] }));
      },
      () => true
    );

    const task1 = makeTask({ ruleName: 'rule-err', options: { opt: 1 } });
    const task2 = makeTask({ ruleName: 'rule-ok', options: { opt: 2 } });
    const results = await executeBatchedTasks([task1, task2], mockContext);

    expect(results).toHaveLength(2);
  });
});
