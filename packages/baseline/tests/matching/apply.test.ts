import path from 'node:path';
import type { BaselineFile, RuleFailure, RuleResult } from '@ngcompass/common';
import { applyBaseline } from '../../src/matching/apply.js';
import type { BaselineScope } from '../../src/models/index.js';

const ROOT = path.resolve('/repo');

function abs(relative: string): string {
  return path.resolve(ROOT, relative);
}

function failure(
  relativePath: string,
  ruleName: string,
  line: number,
  message = 'violation'
): RuleFailure {
  return {
    filePath: abs(relativePath),
    ruleName,
    message,
    line,
    column: 1,
    severity: 'error',
  };
}

function resultOf(
  ruleName: string,
  failures: ReadonlyArray<RuleFailure>,
  taskId = `${ruleName}-task`
): RuleResult {
  return { ruleName, failures, taskId };
}

function scopeOf(files: string[], rules: string[]): BaselineScope {
  return {
    files: new Set(files.map(abs)),
    rules: new Set(rules),
  };
}

function baselineOf(
  entries: Record<string, Record<string, number>>
): BaselineFile {
  return { version: 1, entries };
}

describe('applyBaseline', () => {
  it('suppresses the recorded count and reports the excess', () => {
    const failures = [
      failure('src/a.ts', 'no-subscribe', 10),
      failure('src/a.ts', 'no-subscribe', 20),
      failure('src/a.ts', 'no-subscribe', 30),
    ];
    const outcome = applyBaseline(
      [resultOf('no-subscribe', failures)],
      baselineOf({ 'src/a.ts': { 'no-subscribe': 2 } }),
      scopeOf(['src/a.ts'], ['no-subscribe']),
      ROOT
    );

    expect(outcome.suppressedCount).toBe(2);
    expect(outcome.results.flatMap((r) => r.failures)).toEqual([
      { ...failures[2], message: expect.stringContaining('violation') },
    ]);
  });

  it('explains the allowance on every failure beyond the recorded count', () => {
    const failures = [
      failure('src/a.ts', 'no-subscribe', 10),
      failure('src/a.ts', 'no-subscribe', 20),
      failure('src/a.ts', 'no-subscribe', 30),
    ];
    const outcome = applyBaseline(
      [resultOf('no-subscribe', failures)],
      baselineOf({ 'src/a.ts': { 'no-subscribe': 1 } }),
      scopeOf(['src/a.ts'], ['no-subscribe']),
      ROOT
    );

    const reported = outcome.results.flatMap((r) => r.failures);
    expect(reported.map((f) => f.message)).toEqual([
      'violation This file exceeds its baseline allowance of 1 for this rule (found 3).',
      'violation This file exceeds its baseline allowance of 1 for this rule (found 3).',
    ]);
  });

  it('leaves the message alone for a file with no baseline entry', () => {
    const failures = [failure('src/b.ts', 'no-subscribe', 10)];
    const outcome = applyBaseline(
      [resultOf('no-subscribe', failures)],
      baselineOf({ 'src/a.ts': { 'no-subscribe': 1 } }),
      scopeOf(['src/a.ts', 'src/b.ts'], ['no-subscribe']),
      ROOT
    );

    expect(outcome.results.flatMap((r) => r.failures)).toEqual(failures);
  });

  it('reports nothing when the count matches the baseline exactly', () => {
    const failures = [
      failure('src/a.ts', 'no-subscribe', 10),
      failure('src/a.ts', 'no-subscribe', 20),
    ];
    const outcome = applyBaseline(
      [resultOf('no-subscribe', failures)],
      baselineOf({ 'src/a.ts': { 'no-subscribe': 2 } }),
      scopeOf(['src/a.ts'], ['no-subscribe']),
      ROOT
    );

    expect(outcome.results).toEqual([]);
  });

  it('records a stale entry when fewer violations remain than recorded', () => {
    const outcome = applyBaseline(
      [resultOf('no-subscribe', [failure('src/a.ts', 'no-subscribe', 10)])],
      baselineOf({ 'src/a.ts': { 'no-subscribe': 3 } }),
      scopeOf(['src/a.ts'], ['no-subscribe']),
      ROOT
    );

    expect(outcome.staleEntries).toEqual([
      { filePath: 'src/a.ts', ruleName: 'no-subscribe', recorded: 3, found: 1 },
    ]);
  });

  it('reports every failure for a file with no baseline entry', () => {
    const failures = [
      failure('src/b.ts', 'no-subscribe', 5),
      failure('src/b.ts', 'no-subscribe', 6),
    ];
    const outcome = applyBaseline(
      [resultOf('no-subscribe', failures)],
      baselineOf({ 'src/a.ts': { 'no-subscribe': 2 } }),
      scopeOf(['src/a.ts', 'src/b.ts'], ['no-subscribe']),
      ROOT
    );

    expect(outcome.suppressedCount).toBe(0);
    expect(outcome.results.flatMap((r) => r.failures)).toHaveLength(2);
  });

  it('reports the same failure across repeated runs on identical input', () => {
    const build = (): RuleResult[] => [
      resultOf('no-subscribe', [
        failure('src/a.ts', 'no-subscribe', 30),
        failure('src/a.ts', 'no-subscribe', 10),
        failure('src/a.ts', 'no-subscribe', 20),
      ]),
    ];
    const baseline = baselineOf({ 'src/a.ts': { 'no-subscribe': 2 } });
    const scope = scopeOf(['src/a.ts'], ['no-subscribe']);

    const first = applyBaseline(build(), baseline, scope, ROOT);
    const second = applyBaseline(build(), baseline, scope, ROOT);

    const lineOf = (outcome: typeof first): number =>
      outcome.results.flatMap((r) => r.failures)[0].line;
    expect(lineOf(first)).toBe(30);
    expect(lineOf(second)).toBe(30);
  });

  it('counts warnings and errors against the same allowance', () => {
    const failures: RuleFailure[] = [
      { ...failure('src/a.ts', 'prefer-signals', 1), severity: 'warn' },
      { ...failure('src/a.ts', 'prefer-signals', 2), severity: 'error' },
    ];
    const outcome = applyBaseline(
      [resultOf('prefer-signals', failures)],
      baselineOf({ 'src/a.ts': { 'prefer-signals': 2 } }),
      scopeOf(['src/a.ts'], ['prefer-signals']),
      ROOT
    );

    expect(outcome.suppressedCount).toBe(2);
  });

  it('leaves the original results untouched when nothing is suppressed', () => {
    const results = [
      resultOf('no-subscribe', [failure('src/b.ts', 'no-subscribe', 5)]),
    ];
    const outcome = applyBaseline(
      results,
      baselineOf({}),
      scopeOf(['src/b.ts'], ['no-subscribe']),
      ROOT
    );

    expect(outcome.results).toBe(results);
  });

  it('ignores baseline entries for rules outside the run scope', () => {
    const outcome = applyBaseline(
      [],
      baselineOf({ 'src/a.ts': { 'other-rule': 4 } }),
      scopeOf(['src/a.ts'], ['no-subscribe']),
      ROOT
    );

    expect(outcome.staleEntries).toEqual([]);
  });

  it('ignores baseline entries for files outside the run scope', () => {
    const outcome = applyBaseline(
      [],
      baselineOf({ 'src/other.ts': { 'no-subscribe': 4 } }),
      scopeOf(['src/a.ts'], ['no-subscribe']),
      ROOT
    );

    expect(outcome.staleEntries).toEqual([]);
    expect(outcome.unmatchedFiles).toEqual(['src/other.ts']);
  });

  it('carries counts across a uniquely renamed file', () => {
    const failures = [
      failure('src/features/user.component.ts', 'no-subscribe', 10),
      failure('src/features/user.component.ts', 'no-subscribe', 20),
    ];
    const outcome = applyBaseline(
      [resultOf('no-subscribe', failures)],
      baselineOf({ 'src/user.component.ts': { 'no-subscribe': 2 } }),
      scopeOf(['src/features/user.component.ts'], ['no-subscribe']),
      ROOT
    );

    expect(outcome.suppressedCount).toBe(2);
    expect(outcome.renamed).toEqual([
      {
        from: 'src/user.component.ts',
        to: 'src/features/user.component.ts',
      },
    ]);
  });

  it('refuses to guess when two candidates share a basename', () => {
    const outcome = applyBaseline(
      [],
      baselineOf({ 'src/user.component.ts': { 'no-subscribe': 2 } }),
      scopeOf(
        ['src/a/user.component.ts', 'src/b/user.component.ts'],
        ['no-subscribe']
      ),
      ROOT
    );

    expect(outcome.renamed).toEqual([]);
    expect(outcome.ambiguousFiles).toEqual(['src/user.component.ts']);
  });
});
