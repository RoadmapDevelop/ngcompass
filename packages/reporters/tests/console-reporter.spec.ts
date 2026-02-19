import { describe, it, expect, beforeEach } from 'vitest';
import { ConsoleReporter } from '../src/reporters/console-reporter.js';
import { createTestOutput } from '../src/output.js';
import type { RuleResult, ResultSummary } from '../src/types.js';

function makeResult(failures: RuleResult['failures']): RuleResult {
    return { ruleName: 'test-rule', failures };
}

function makeFailure(overrides: Partial<RuleResult['failures'][0]> = {}): RuleResult['failures'][0] {
    return {
        filePath: '/project/src/app.component.ts',
        message: 'Use OnPush change detection',
        line: 5,
        column: 1,
        severity: 'error',
        ruleName: 'prefer-on-push',
        ...overrides,
    };
}

const stats: ResultSummary = {
    totalFiles: 10,
    totalTasks: 20,
    cachedTasks: 5,
    totalErrors: 1,
    totalWarnings: 2,
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
            reporter.report([]);
            expect(out.lines.some(l => l.includes('No violations found'))).toBe(true);
        });

        it('outputs file header and violation line for a failure', () => {
            reporter.report([makeResult([makeFailure()])]);
            const output = out.lines.join('\n');
            expect(output).toContain('app.component.ts');
            expect(output).toContain('5:1');
            expect(output).toContain('prefer-on-push');
        });

        it('counts errors vs warnings correctly in summary', () => {
            reporter.report([
                makeResult([
                    makeFailure({ severity: 'error' }),
                    makeFailure({ severity: 'warning', line: 10 }),
                ]),
            ]);
            const summary = out.lines.find(l => l.includes('problem'))!;
            expect(summary).toContain('2 problems');
            expect(summary).toContain('1 error');
            expect(summary).toContain('1 warning');
        });

        it('sorts files alphabetically', () => {
            reporter.report([
                makeResult([
                    makeFailure({ filePath: '/project/src/z.component.ts' }),
                    makeFailure({ filePath: '/project/src/a.component.ts' }),
                ]),
            ]);
            const fileLines = out.lines.filter(l => l.includes('.component.ts'));
            expect(fileLines[0]).toContain('a.component.ts');
            expect(fileLines[1]).toContain('z.component.ts');
        });

        it('shows fix recommendation in verbose mode', () => {
            const verboseReporter = new ConsoleReporter(out.output, { verbose: true });
            verboseReporter.report([makeResult([makeFailure({ fix: 'Add standalone: true' })])]);
            expect(out.lines.some(l => l.includes('Add standalone: true'))).toBe(true);
        });

        it('does not show fix recommendation without verbose flag', () => {
            reporter.report([makeResult([makeFailure({ fix: 'Add standalone: true' })])]);
            expect(out.lines.some(l => l.includes('Add standalone: true'))).toBe(false);
        });
    });

    describe('summary()', () => {
        it('outputs file count, task count, and duration', () => {
            reporter.summary(stats);
            const line = out.lines[0];
            expect(line).toContain('10 files');
            expect(line).toContain('20 tasks');
            expect(line).toContain('5 cached');
            expect(line).toContain('123ms');
        });

        it('omits cached info when cachedTasks is undefined', () => {
            reporter.summary({ ...stats, cachedTasks: undefined });
            expect(out.lines[0]).not.toContain('cached');
        });
    });

    describe('error()', () => {
        it('outputs error prefix and message', () => {
            reporter.error(new Error('Something broke'));
            expect(out.errors[0]).toContain('✗ Analysis failed');
            expect(out.errors[1]).toContain('Something broke');
        });
    });
});
