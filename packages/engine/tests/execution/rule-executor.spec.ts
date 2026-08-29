import { describe, it, expect, afterEach } from 'vitest';
import {
  configureRuleExecutor,
  getConfiguredExecutor,
  getConfiguredChecker,
} from '../../src/execution/rule-executor.js';
import type {
  BatchRuleExecutorFn,
  RuleCheckerFn,
} from '../../src/execution/rule-executor.js';

afterEach(() => {
  configureRuleExecutor(
    () => {
      throw new Error('not configured');
    },
    () => false
  );
});

describe('rule-executor — default state', () => {
  it('default executor throws when called', () => {
    configureRuleExecutor(
      () => {
        throw new Error('Rule executor not configured.');
      },
      () => false
    );
    const executor = getConfiguredExecutor();
    expect(() =>
      executor([], { filePath: '/a.ts', fileContent: '', locator: null as any })
    ).toThrowError(/not configured/i);
  });

  it('default checker returns false for any rule', () => {
    configureRuleExecutor(
      () => {
        throw new Error();
      },
      () => false
    );
    expect(getConfiguredChecker()('some-rule')).toBe(false);
    expect(getConfiguredChecker()('another-rule')).toBe(false);
  });
});

describe('configureRuleExecutor', () => {
  it('replaces the executor with the provided function', () => {
    const mockResult = [{ ruleName: 'x', failures: [] }];
    const mockExecutor: BatchRuleExecutorFn = () => mockResult;
    const mockChecker: RuleCheckerFn = () => true;

    configureRuleExecutor(mockExecutor, mockChecker);

    expect(getConfiguredExecutor()).toBe(mockExecutor);
  });

  it('replaces the checker with the provided function', () => {
    const mockExecutor: BatchRuleExecutorFn = () => [];
    const mockChecker: RuleCheckerFn = (name) => name === 'allowed-rule';

    configureRuleExecutor(mockExecutor, mockChecker);

    expect(getConfiguredChecker()).toBe(mockChecker);
  });

  it('configured executor is actually invoked', () => {
    let invoked = false;
    const mockExecutor: BatchRuleExecutorFn = () => {
      invoked = true;
      return [];
    };
    configureRuleExecutor(mockExecutor, () => true);

    getConfiguredExecutor()([], {
      filePath: '/a.ts',
      fileContent: '',
      locator: null as any,
    });
    expect(invoked).toBe(true);
  });

  it('configured checker is actually invoked', () => {
    const seen: string[] = [];
    const mockChecker: RuleCheckerFn = (name) => {
      seen.push(name);
      return true;
    };
    configureRuleExecutor(() => [], mockChecker);

    getConfiguredChecker()('my-rule');
    expect(seen).toContain('my-rule');
  });

  it('calling configureRuleExecutor twice replaces both', () => {
    const first: BatchRuleExecutorFn = () => [];
    const second: BatchRuleExecutorFn = () => [];

    configureRuleExecutor(first, () => false);
    configureRuleExecutor(second, () => true);

    expect(getConfiguredExecutor()).toBe(second);
    expect(getConfiguredChecker()('any')).toBe(true);
  });
});
