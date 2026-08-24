import type { BaselineFile } from '@ngcompass/common';
import { summarizeBaseline } from '../src/summary.js';

function baselineOf(
  entries: Record<string, Record<string, number>>
): BaselineFile {
  return { version: 1, entries };
}

describe('summarizeBaseline', () => {
  it('groups violations by rule across files', () => {
    const report = summarizeBaseline(
      baselineOf({
        'src/a.ts': { 'rule-a': 2, 'rule-b': 1 },
        'src/b.ts': { 'rule-a': 3 },
      }),
      'baseline.json',
      10
    );

    expect(report.rules.map((r) => [r.ruleName, r.total])).toEqual([
      ['rule-a', 5],
      ['rule-b', 1],
    ]);
  });

  it('counts every file a rule appears in', () => {
    const report = summarizeBaseline(
      baselineOf({
        'src/a.ts': { 'rule-a': 2 },
        'src/b.ts': { 'rule-a': 3 },
        'src/c.ts': { 'rule-a': 1 },
      }),
      'baseline.json',
      10
    );

    expect(report.rules[0].fileCount).toBe(3);
  });

  it('reports each rule share of the total', () => {
    const report = summarizeBaseline(
      baselineOf({ 'src/a.ts': { 'rule-a': 3, 'rule-b': 1 } }),
      'baseline.json',
      10
    );

    expect(report.rules[0].share).toBeCloseTo(0.75);
    expect(report.rules[1].share).toBeCloseTo(0.25);
  });

  it('lists the worst files first within a rule', () => {
    const report = summarizeBaseline(
      baselineOf({
        'src/low.ts': { 'rule-a': 1 },
        'src/high.ts': { 'rule-a': 9 },
      }),
      'baseline.json',
      10
    );

    expect(report.rules[0].files.map((f) => f.filePath)).toEqual([
      'src/high.ts',
      'src/low.ts',
    ]);
  });

  it('truncates the file list per rule and reports the remainder', () => {
    const report = summarizeBaseline(
      baselineOf({
        'src/a.ts': { 'rule-a': 1 },
        'src/b.ts': { 'rule-a': 1 },
        'src/c.ts': { 'rule-a': 1 },
        'src/d.ts': { 'rule-a': 1 },
      }),
      'baseline.json',
      2
    );

    expect(report.rules[0].files).toHaveLength(2);
    expect(report.rules[0].omittedFiles).toBe(2);
  });

  it('breaks ties on rule name so output is stable', () => {
    const report = summarizeBaseline(
      baselineOf({ 'src/a.ts': { zebra: 2, alpha: 2 } }),
      'baseline.json',
      10
    );

    expect(report.rules.map((r) => r.ruleName)).toEqual(['alpha', 'zebra']);
  });

  it('reports an empty baseline without dividing by zero', () => {
    const report = summarizeBaseline(baselineOf({}), 'baseline.json', 10);

    expect(report.totalViolations).toBe(0);
    expect(report.totalFiles).toBe(0);
    expect(report.rules).toEqual([]);
  });
});
