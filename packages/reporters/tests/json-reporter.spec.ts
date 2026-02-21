import { describe, it, expect, beforeEach } from 'vitest';
import { JsonReporter } from '../src/reporters/json-reporter.js';
import { createTestOutput } from '../src/output.js';
import type { FileDiagnosticResult, RuleResult } from '../src/types.js';

function makeResult(filePath: string, overrides: Partial<RuleResult['failures'][0]> = {}): RuleResult {
    return {
        ruleName: 'test-rule',
        failures: [{
            filePath,
            message: 'Test violation',
            line: 1,
            column: 1,
            severity: 'error',
            ruleName: 'test-rule',
            ...overrides,
        }],
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
            const parsed = JSON.parse(out.lines[0]);
            expect(Array.isArray(parsed)).toBe(true);
            expect(parsed).toHaveLength(0);
        });

        it('maps error severity to ESLint severity 2', () => {
            reporter.report([makeResult('/a.ts', { severity: 'error' })]);
            const parsed: FileDiagnosticResult[] = JSON.parse(out.lines[0]);
            expect(parsed[0].messages[0].severity).toBe(2);
            expect(parsed[0].errorCount).toBe(1);
            expect(parsed[0].warningCount).toBe(0);
        });

        it('maps critical severity to ESLint severity 2', () => {
            reporter.report([makeResult('/a.ts', { severity: 'critical' })]);
            const parsed: FileDiagnosticResult[] = JSON.parse(out.lines[0]);
            expect(parsed[0].messages[0].severity).toBe(2);
        });

        it('maps warning severity to ESLint severity 1', () => {
            reporter.report([makeResult('/a.ts', { severity: 'warning' })]);
            const parsed: FileDiagnosticResult[] = JSON.parse(out.lines[0]);
            expect(parsed[0].messages[0].severity).toBe(1);
            expect(parsed[0].warningCount).toBe(1);
            expect(parsed[0].errorCount).toBe(0);
        });

        it('sorts files alphabetically', () => {
            reporter.report([makeResult('/z.ts'), makeResult('/a.ts')]);
            const parsed: FileDiagnosticResult[] = JSON.parse(out.lines[0]);
            expect(parsed[0].filePath).toBe('/a.ts');
            expect(parsed[1].filePath).toBe('/z.ts');
        });

        it('sorts messages within a file by line then column', () => {
            reporter.report([{
                ruleName: 'rule',
                failures: [
                    { filePath: '/a.ts', message: 'b', line: 10, column: 1, severity: 'warning', ruleName: 'rule' },
                    { filePath: '/a.ts', message: 'a', line: 1, column: 5, severity: 'warning', ruleName: 'rule' },
                ],
            }]);
            const parsed: FileDiagnosticResult[] = JSON.parse(out.lines[0]);
            expect(parsed[0].messages[0].line).toBe(1);
            expect(parsed[0].messages[1].line).toBe(10);
        });

        it('includes ruleId in each message', () => {
            reporter.report([makeResult('/a.ts')]);
            const parsed: FileDiagnosticResult[] = JSON.parse(out.lines[0]);
            expect(parsed[0].messages[0].ruleId).toBe('test-rule');
        });
    });

    describe('summary()', () => {
        it('produces no output (consumers parse the JSON array)', () => {
            reporter.summary({ totalFiles: 1, totalTasks: 1, totalErrors: 0, totalWarnings: 0, duration: 0 });
            expect(out.lines).toHaveLength(0);
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
