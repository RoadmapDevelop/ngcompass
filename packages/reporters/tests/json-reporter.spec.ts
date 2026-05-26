import { describe, it, expect, beforeEach } from 'vitest';
import { JsonReporter } from '../src/reporters/json-reporter.js';
import { createTestOutput } from '../src/output.js';
import type { FileDiagnosticResult, RuleResult } from '../src/types.js';

const summary = {
  scannedFiles: 1,
  totalFiles: 1,
  totalTasks: 1,
  totalErrors: 1,
  totalWarnings: 0,
  failOnSeverity: 'error' as const,
  maxWarnings: 10,
  duration: 1,
};

function makeResult(
  filePath: string,
  overrides: Partial<RuleResult['failures'][0]> = {}
): RuleResult {
  return {
    ruleName: 'test-rule',
    failures: [
      {
        filePath,
        message: 'Test violation',
        line: 1,
        column: 1,
        severity: 'error',
        ruleName: 'test-rule',
        ...overrides,
      },
    ],
  };
}

describe('JsonReporter', () => {
  let out: ReturnType<typeof createTestOutput>;
  let reporter: JsonReporter;

  beforeEach(() => {
    out = createTestOutput();
    reporter = new JsonReporter(out.output);
  });

  describe('report()', () => {
    it('emits valid JSON for zero results', () => {
      reporter.report([]);
      reporter.summary({
        ...summary,
        totalErrors: 0,
        totalFiles: 0,
        totalTasks: 0,
      });
      const parsed = JSON.parse(out.lines[0]);
      expect(parsed.summary.status).toBe('passed');
      expect(parsed.summary.statusLabel).toBe('PASS');
      expect(parsed.results).toEqual([]);
    });

    it('maps error severity to ESLint severity 2', () => {
      reporter.report([makeResult('/a.ts', { severity: 'error' })]);
      reporter.summary(summary);
      const parsed: { results: FileDiagnosticResult[] } = JSON.parse(
        out.lines[0]
      );
      expect(parsed.results[0].messages[0].severity).toBe(2);
      expect(parsed.results[0].errorCount).toBe(1);
      expect(parsed.results[0].warningCount).toBe(0);
    });

    it('maps warning severity to ESLint severity 1', () => {
      reporter.report([makeResult('/a.ts', { severity: 'warning' })]);
      reporter.summary({ ...summary, totalErrors: 0, totalWarnings: 1 });
      const parsed: {
        summary: { statusLabel: string };
        results: FileDiagnosticResult[];
      } = JSON.parse(out.lines[0]);
      expect(parsed.summary.statusLabel).toBe('WARN');
      expect(parsed.results[0].messages[0].severity).toBe(1);
      expect(parsed.results[0].warningCount).toBe(1);
      expect(parsed.results[0].errorCount).toBe(0);
    });

    it('sorts files alphabetically', () => {
      reporter.report([makeResult('/z.ts'), makeResult('/a.ts')]);
      reporter.summary({ ...summary, totalErrors: 2 });
      const parsed: { results: FileDiagnosticResult[] } = JSON.parse(
        out.lines[0]
      );
      expect(parsed.results[0].filePath).toBe('/a.ts');
      expect(parsed.results[1].filePath).toBe('/z.ts');
    });

    it('sorts messages within a file by line then column', () => {
      reporter.report([
        {
          ruleName: 'rule',
          failures: [
            {
              filePath: '/a.ts',
              message: 'b',
              line: 10,
              column: 1,
              severity: 'warning',
              ruleName: 'rule',
            },
            {
              filePath: '/a.ts',
              message: 'a',
              line: 1,
              column: 5,
              severity: 'warning',
              ruleName: 'rule',
            },
          ],
        },
      ]);
      reporter.summary({ ...summary, totalErrors: 0, totalWarnings: 2 });
      const parsed: { results: FileDiagnosticResult[] } = JSON.parse(
        out.lines[0]
      );
      expect(parsed.results[0].messages[0].line).toBe(1);
      expect(parsed.results[0].messages[1].line).toBe(10);
    });

    it('includes ruleId in each message', () => {
      reporter.report([makeResult('/a.ts')]);
      reporter.summary(summary);
      const parsed: { results: FileDiagnosticResult[] } = JSON.parse(
        out.lines[0]
      );
      expect(parsed.results[0].messages[0].ruleId).toBe('test-rule');
    });
  });

  describe('summary()', () => {
    it('emits run-level status', () => {
      reporter.report([makeResult('/a.ts')]);
      reporter.summary(summary);
      const parsed = JSON.parse(out.lines[0]);
      expect(parsed.summary.status).toBe('failed');
      expect(parsed.summary.statusLabel).toBe('FAILED');
      expect(parsed.summary.totalViolations).toBe(1);
    });
  });

  describe('error()', () => {
    it('emits valid JSON error object to stderr', () => {
      reporter.error(new Error('parse failed'));
      const parsed = JSON.parse(out.errors[0]);
      expect(parsed.error).toBe('parse failed');
    });
  });
});
