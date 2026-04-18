import { describe, it, expect, beforeEach } from 'vitest';
import { TextConfigReporter } from '../src/reporters/config.js';
import { createTestOutput } from '../src/output.js';
import type { HealthReport, InitResult, ConfigReport } from '@ngcompass/common';

function makeHealthReport(overrides: Partial<HealthReport> = {}): HealthReport {
    return { valid: true, issues: [], ...overrides };
}

function makeConfigReport(overrides: Partial<ConfigReport> = {}): ConfigReport {
    return { valid: true, issues: [], ...overrides };
}

describe('TextConfigReporter', () => {
    let out: ReturnType<typeof createTestOutput>;
    let reporter: TextConfigReporter;

    beforeEach(() => {
        out = createTestOutput();
        reporter = new TextConfigReporter(out.output);
    });

    describe('reportConfig()', () => {
        it('does nothing for a valid config', () => {
            reporter.reportConfig(makeConfigReport({ valid: true }));
            expect(out.errors).toHaveLength(0);
            expect(out.lines).toHaveLength(0);
        });

        it('outputs error prefix for invalid config', () => {
            reporter.reportConfig(makeConfigReport({
                valid: false,
                issues: [{ code: 'E001', message: 'Bad value', severity: 'error', path: ['rules', 0] }],
            }));
            expect(out.errors[0]).toContain('Configuration validation failed');
            expect(out.errors[1]).toContain('rules[0]');
            expect(out.errors[1]).toContain('Bad value');
        });
    });

    describe('renderInitResult()', () => {
        it('outputs success checkmark', () => {
            const result: InitResult = { success: true, filePath: 'ngcompass.json' };
            reporter.renderInitResult(result);
            expect(out.lines[0]).toContain('ngcompass.json');
            expect(out.lines[0]).toContain('✓');
        });

        it('outputs middot with (exists) when file already exists', () => {
            const result: InitResult = { success: false, filePath: 'ngcompass.json', alreadyExists: true };
            reporter.renderInitResult(result);
            expect(out.lines[0]).toContain('(exists)');
        });

        it('outputs error cross for a failed initialization', () => {
            const result: InitResult = { success: false, filePath: 'ngcompass.json' };
            reporter.renderInitResult(result);
            expect(out.errors[0]).toContain('×');
        });
    });

    describe('renderHealthReport()', () => {
        it('outputs OK status when there are no issues', () => {
            reporter.renderHealthReport(makeHealthReport());
            const output = out.lines.join('\n');
            expect(output).toContain('No issues found');
            expect(output).toContain('OK');
        });

        it('counts errors and warnings correctly', () => {
            reporter.renderHealthReport(makeHealthReport({
                valid: false,
                issues: [
                    { code: 'E1', message: 'err', severity: 'error' },
                    { code: 'W1', message: 'warn', severity: 'warning' },
                ],
            }));
            const summary = out.lines.find(l => l.includes('issue'))!;
            expect(summary).toContain('2 issues');
            expect(summary).toContain('1 error');
            expect(summary).toContain('1 warning');
        });

        it('groups issues by file', () => {
            reporter.renderHealthReport(makeHealthReport({
                valid: false,
                issues: [
                    { code: 'E1', message: 'err', severity: 'error', file: 'ngcompass.json' },
                ],
            }));
            const output = out.lines.join('\n');
            expect(output).toContain('ngcompass.json');
        });
    });
});
