import { describe, it, expect, beforeEach } from 'vitest';
import { ConsoleReporter } from '../src/reporters/console-reporter.js';
import { createTestOutput } from '../src/output.js';
import type { RuleResult, ResultSummary } from '../src/types.js';

function makeResult(failures: RuleResult['failures']): RuleResult {
    return { ruleName: 'test-rule', failures };
}

function makeFailure(overrides: Partial<RuleResult['failures'][0]> = {}): RuleResult['failures'][0] {
    return {
        filePath: 'src/app.component.ts', // Relative path for predictable testing
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
    duration: 123,  // renamed from durationMs — matches ResultSummary.duration
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
            // Check for the FAIL tag and path (case-insensitive and platform-agnostic)
            expect(output).toMatch(/FAIL/i);
            expect(output).toMatch(/src[\\\/]app\.component\.ts/);
            // Check for the location line with ❯ indicator
            expect(output).toContain('❯');
            expect(output).toMatch(/5:1/);
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
            // The header line contains 'FAIL ' or 'WARN ' followed by the path
            const headerLines = out.lines.filter(l => l.match(/(FAIL|WARN)\s+.*\.component\.ts/));
            expect(headerLines[0]).toContain('a.component.ts');
            expect(headerLines[1]).toContain('z.component.ts');
        });

        it('shows fix recommendation', () => {
            reporter.report([makeResult([makeFailure({ fix: 'Add standalone: true' })])]);
            expect(out.lines.some(l => l.includes('❯') && l.includes('Add standalone: true'))).toBe(true);
        });
    });

    describe('summary()', () => {
        it('does not output anything (minimal summary requested)', () => {
            reporter.summary(stats);
            expect(out.lines.length).toBe(0);
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
