import { describe, it, expect, beforeEach } from 'vitest';
import { ConsoleReporter } from '../src/reporters/console-reporter.js';
import { createTestOutput } from '../src/output.js';
import type { RuleResult } from '@ngcompass/common';
import type { ResultSummary } from '../src/types.js';

const ANSI_RE = /\x1B\[[0-?]*[ -/]*[@-~]/g;

function stripAnsi(value: string): string {
  return value.replace(ANSI_RE, '');
}

function makeResult(failures: RuleResult['failures']): RuleResult {
  return { ruleName: 'test-rule', failures };
}

function makeFailure(
  overrides: Partial<RuleResult['failures'][0]> = {}
): RuleResult['failures'][0] {
  return {
    filePath: 'src/app.component.ts',
    message: 'Use OnPush change detection',
    line: 5,
    column: 1,
    severity: 'error',
    ruleName: 'prefer-on-push',
    ...overrides,
  };
}

const stats: ResultSummary = {
  scannedFiles: 10,
  totalFiles: 10,
  totalTasks: 20,
  cachedTasks: 5,
  totalErrors: 1,
  totalWarnings: 2,
  failOnSeverity: 'error',
  maxWarnings: 10,
  duration: 123,
};

describe('ConsoleReporter', () => {
  let out: ReturnType<typeof createTestOutput>;
  let reporter: ConsoleReporter;

  beforeEach(() => {
    out = createTestOutput();
    reporter = new ConsoleReporter(out.output);
  });

  describe('report()', () => {
    it('outputs green success message when no violations', () => {
      reporter.summary({ ...stats, totalErrors: 0, totalWarnings: 0 });
      reporter.report([]);
      const output = stripAnsi(out.lines.join('\n'));
      expect(output).toContain('PASS');
      expect(output).toContain('No violations found');
      expect(output).toContain('10 files  no issues');
    });

    it('shows skipped files and excludes them from the no-issues count', () => {
      reporter.summary({
        ...stats,
        totalErrors: 0,
        totalWarnings: 0,
        scannedFiles: 10,
        skippedFiles: 2,
      });
      reporter.report([]);
      const output = stripAnsi(out.lines.join('\n'));
      expect(output).toContain('8 files  no issues');
      expect(output).toContain('2 files skipped');
    });

    it('shows skipped files alongside violations', () => {
      reporter.summary({ ...stats, scannedFiles: 10, skippedFiles: 1 });
      reporter.report([makeResult([makeFailure()])]);
      const output = stripAnsi(out.lines.join('\n'));
      expect(output).toContain('files with violations');
      expect(output).toContain('1 files skipped');
    });

    it('outputs file header and violation line for a failure', () => {
      reporter.report([makeResult([makeFailure()])]);
      const output = out.lines.join('\n');

      expect(output).toMatch(/FAIL/i);
      expect(output).toMatch(/src[\\\/]app\.component\.ts/);

      expect(output).toContain('❯');
      expect(output).toMatch(/5:1/);
      expect(output).toContain('prefer-on-push');
    });

    it('counts errors vs warnings correctly in summary', () => {
      reporter.report([
        makeResult([
          makeFailure({ severity: 'error' }),
          makeFailure({ severity: 'warn', line: 10 }),
        ]),
      ]);
      const summary = out.lines.find((l) => l.includes('violation'))!;
      expect(summary).toContain('2 violations');
      expect(summary).toContain('1 error');
      expect(summary).toContain('1 warning');
      expect(
        out.lines.some((l) => l.includes('ngcompass analyze --format html'))
      ).toBe(true);
    });

    it('outputs passed-with-warnings verdict when warnings are below the configured threshold', () => {
      reporter.summary({ ...stats, totalErrors: 0, totalWarnings: 1 });
      reporter.report([makeResult([makeFailure({ severity: 'warn' })])]);

      const output = stripAnsi(out.lines.join('\n'));
      expect(output).toContain('WARN');
      expect(output).not.toContain('Analysis passed with warnings');
    });

    it('outputs failed verdict when warnings exceed maxWarnings', () => {
      reporter.summary({
        ...stats,
        totalErrors: 0,
        totalWarnings: 2,
        maxWarnings: 1,
      });
      reporter.report([
        makeResult([
          makeFailure({ severity: 'warn' }),
          makeFailure({ severity: 'warn', line: 10 }),
        ]),
      ]);

      const output = stripAnsi(out.lines.join('\n'));
      expect(output).toContain('FAILED');
      expect(output).not.toContain('Analysis failed');
    });

    it('sorts files alphabetically', () => {
      reporter.report([
        makeResult([
          makeFailure({ filePath: '/project/src/z.component.ts' }),
          makeFailure({ filePath: '/project/src/a.component.ts' }),
        ]),
      ]);

      const headerLines = out.lines.filter((l) =>
        l.match(/(FAIL|WARN)\s+.*\.component\.ts/)
      );
      expect(headerLines[0]).toContain('a.component.ts');
      expect(headerLines[1]).toContain('z.component.ts');
    });
    it('outputs recommendation with » icon when fix is present', () => {
      reporter.report([
        makeResult([makeFailure({ fix: 'Step one. Step two.' })]),
      ]);
      const output = out.lines.join('\n');
      expect(output).toMatch(/».*Step one. Step two/);
    });

    it('renders external HTML code frames with aligned gutters and HTML content', () => {
      const htmlPath = 'src/app.component.html';
      reporter = new ConsoleReporter(out.output, undefined, {
        readLines: () => [
          '<section>',
          '  <button type="button" (click)="save()">{{ label() }}</button>',
          '</section>',
        ],
      });

      reporter.report([
        makeResult([
          makeFailure({
            filePath: htmlPath,
            line: 2,
            column: 3,
            ruleName: 'template-no-call-expression',
          }),
        ]),
      ]);

      const physicalLines = out.lines.flatMap((line) =>
        stripAnsi(line).split('\n')
      );
      expect(physicalLines).toContain('    1 | <section>');
      expect(physicalLines).toContain(
        '  > 2 |   <button type="button" (click)="save()">{{ label() }}</button>'
      );
      expect(physicalLines.some((line) => line.includes('    |   ^'))).toBe(
        true
      );
    });

    it('uses warn instead of warning in compact mode', () => {
      reporter = new ConsoleReporter(out.output, { compact: true });

      reporter.report([makeResult([makeFailure({ severity: 'warn' })])]);

      const output = stripAnsi(out.lines.join('\n'));
      expect(output).toContain('warn');
      expect(output).not.toContain('warning  Use OnPush');
    });

    it('aligns compact recommendations with the violation message', () => {
      reporter = new ConsoleReporter(out.output, { compact: true });

      reporter.report([
        makeResult([
          makeFailure({
            line: 250,
            column: 7,
            severity: 'error',
            message: 'A component subscription without teardown',
            fix: 'Add `takeUntilDestroyed()` before `subscribe()`.',
          }),
        ]),
      ]);

      const physicalLines = out.lines.flatMap((line) =>
        stripAnsi(line).split('\n')
      );
      const failureLine = physicalLines.find((line) =>
        line.includes('A component subscription')
      )!;
      const recommendationLine = physicalLines.find((line) =>
        line.includes('Add `takeUntilDestroyed()`')
      )!;

      expect(recommendationLine.indexOf('→')).toBe(
        failureLine.indexOf('A component subscription')
      );
    });
  });

  describe('summary()', () => {
    it('outputs a concise run summary', () => {
      reporter.summary(stats);
      const line = stripAnsi(out.lines[0]);
      expect(line).toContain('❯ 10 files ·');
      expect(line).toContain('20 checks');
      expect(line).toContain('5 cached');
    });
  });

  describe('progress output', () => {
    it('formats active and completed steps', () => {
      reporter.step('❯ Loading rules...');
      reporter.info('❯ Loaded 18 active rules in 1ms');

      expect(stripAnsi(out.lines[0])).toContain('❯ Loading rules...');
      expect(stripAnsi(out.lines[1])).toContain(
        '❯ Loaded 18 active rules in 1ms'
      );
    });
  });

  describe('error()', () => {
    it('outputs error prefix and message', () => {
      reporter.error(new Error('Something broke'));
      expect(out.errors[0]).toContain('× Analysis failed');
      expect(out.errors[1]).toContain('Something broke');
    });
  });
});
