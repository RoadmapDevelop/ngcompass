import path from 'node:path';
import type { BaselineFile, RuleFailure, RuleResult } from '@ngcompass/common';
import { mergeIntoBaseline, pruneBaseline } from '../../src/matching/merge.js';
import type { BaselineScope } from '../../src/models/index.js';

const ROOT = path.resolve('/repo');

function abs(relative: string): string {
  return path.resolve(ROOT, relative);
}

function failure(
  relativePath: string,
  ruleName: string,
  line: number
): RuleFailure {
  return {
    filePath: abs(relativePath),
    ruleName,
    message: 'violation',
    line,
    column: 1,
    severity: 'error',
  };
}

function resultOf(
  ruleName: string,
  failures: ReadonlyArray<RuleFailure>
): RuleResult {
  return { ruleName, failures, taskId: `${ruleName}-task` };
}

function scopeOf(files: string[], rules: string[]): BaselineScope {
  return { files: new Set(files.map(abs)), rules: new Set(rules) };
}

function baselineOf(
  entries: Record<string, Record<string, number>>
): BaselineFile {
  return { version: 1, entries };
}

describe('mergeIntoBaseline', () => {
  it('records the violations found for pairs inside the scope', () => {
    const merged = mergeIntoBaseline(
      baselineOf({}),
      [
        resultOf('no-subscribe', [
          failure('src/a.ts', 'no-subscribe', 1),
          failure('src/a.ts', 'no-subscribe', 2),
        ]),
      ],
      scopeOf(['src/a.ts'], ['no-subscribe']),
      ROOT
    );

    expect(merged.entries).toEqual({ 'src/a.ts': { 'no-subscribe': 2 } });
  });

  it('records every rule that fired in one file when starting from empty', () => {
    const merged = mergeIntoBaseline(
      baselineOf({}),
      [
        resultOf('no-subscribe', [failure('src/a.ts', 'no-subscribe', 1)]),
        resultOf('prefer-signals', [
          failure('src/a.ts', 'prefer-signals', 2),
          failure('src/a.ts', 'prefer-signals', 3),
        ]),
        resultOf('no-any', [failure('src/a.ts', 'no-any', 4)]),
      ],
      scopeOf(['src/a.ts'], ['no-subscribe', 'prefer-signals', 'no-any']),
      ROOT
    );

    expect(merged.entries['src/a.ts']).toEqual({
      'no-subscribe': 1,
      'prefer-signals': 2,
      'no-any': 1,
    });
  });

  it('leaves other rules untouched during a rule-scoped merge', () => {
    const merged = mergeIntoBaseline(
      baselineOf({ 'src/a.ts': { 'no-subscribe': 3, 'prefer-signals': 5 } }),
      [resultOf('no-subscribe', [failure('src/a.ts', 'no-subscribe', 1)])],
      scopeOf(['src/a.ts'], ['no-subscribe']),
      ROOT
    );

    expect(merged.entries['src/a.ts']).toEqual({
      'no-subscribe': 1,
      'prefer-signals': 5,
    });
  });

  it('leaves other files untouched during a file-scoped merge', () => {
    const merged = mergeIntoBaseline(
      baselineOf({
        'src/a.ts': { 'no-subscribe': 3 },
        'src/b.ts': { 'no-subscribe': 7 },
      }),
      [resultOf('no-subscribe', [failure('src/a.ts', 'no-subscribe', 1)])],
      scopeOf(['src/a.ts'], ['no-subscribe']),
      ROOT
    );

    expect(merged.entries['src/b.ts']).toEqual({ 'no-subscribe': 7 });
  });

  it('removes a pair that dropped to zero violations', () => {
    const merged = mergeIntoBaseline(
      baselineOf({ 'src/a.ts': { 'no-subscribe': 3 } }),
      [],
      scopeOf(['src/a.ts'], ['no-subscribe']),
      ROOT
    );

    expect(merged.entries['src/a.ts']).toBeUndefined();
  });

  it('does not mutate the baseline it was given', () => {
    const existing = baselineOf({ 'src/a.ts': { 'no-subscribe': 3 } });
    mergeIntoBaseline(
      existing,
      [],
      scopeOf(['src/a.ts'], ['no-subscribe']),
      ROOT
    );

    expect(existing.entries['src/a.ts']).toEqual({ 'no-subscribe': 3 });
  });
});

describe('pruneBaseline', () => {
  it('drops entries for files that no longer exist', () => {
    const outcome = pruneBaseline(
      baselineOf({
        'src/a.ts': { 'no-subscribe': 3 },
        'src/gone.ts': { 'no-subscribe': 2 },
      }),
      [
        resultOf('no-subscribe', [
          failure('src/a.ts', 'no-subscribe', 1),
          failure('src/a.ts', 'no-subscribe', 2),
          failure('src/a.ts', 'no-subscribe', 3),
        ]),
      ],
      scopeOf(['src/a.ts'], ['no-subscribe']),
      ROOT
    );

    expect(outcome.baseline.entries).toEqual({
      'src/a.ts': { 'no-subscribe': 3 },
    });
    expect(outcome.removedFiles).toEqual(['src/gone.ts']);
  });

  it('rewrites a renamed file under its new path', () => {
    const outcome = pruneBaseline(
      baselineOf({ 'src/user.component.ts': { 'no-subscribe': 1 } }),
      [
        resultOf('no-subscribe', [
          failure('src/features/user.component.ts', 'no-subscribe', 1),
        ]),
      ],
      scopeOf(['src/features/user.component.ts'], ['no-subscribe']),
      ROOT
    );

    expect(outcome.baseline.entries).toEqual({
      'src/features/user.component.ts': { 'no-subscribe': 1 },
    });
    expect(outcome.renamed).toEqual([
      {
        from: 'src/user.component.ts',
        to: 'src/features/user.component.ts',
      },
    ]);
  });

  it('lowers counts to the violations that remain', () => {
    const outcome = pruneBaseline(
      baselineOf({ 'src/a.ts': { 'no-subscribe': 9 } }),
      [resultOf('no-subscribe', [failure('src/a.ts', 'no-subscribe', 1)])],
      scopeOf(['src/a.ts'], ['no-subscribe']),
      ROOT
    );

    expect(outcome.baseline.entries['src/a.ts']).toEqual({ 'no-subscribe': 1 });
  });
});
