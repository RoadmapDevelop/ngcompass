import { describe, it, expect, beforeEach } from 'vitest';
import { SarifReporter } from '../src/reporters/sarif-reporter.js';
import { createTestOutput } from '../src/output.js';
import type { RuleResult } from '@ngcompass/common';

function makeResult(filePath: string, overrides: Partial<RuleResult['failures'][0]> = {}): RuleResult {
    const ruleName = overrides.ruleName ?? 'test-rule';

    return {
        ruleName,
        failures: [{
            filePath,
            message: 'Test violation',
            line: 3,
            column: 5,
            severity: 'error',
            ruleName,
            ...overrides,
        }],
    };
}

describe('SarifReporter', () => {
    let out: ReturnType<typeof createTestOutput>;
    let reporter: SarifReporter;

    beforeEach(() => {
        out = createTestOutput();
        reporter = new SarifReporter(out.output);
    });

    describe('report()', () => {
        it('emits a SARIF 2.1.0 document for zero results', () => {
            reporter.report([]);
            const parsed = JSON.parse(out.lines[0]);

            expect(parsed.version).toBe('2.1.0');
            expect(parsed.$schema).toBe('https://json.schemastore.org/sarif-2.1.0.json');
            expect(parsed.runs[0].tool.driver.name).toBe('ngcompass');
            expect(parsed.runs[0].results).toEqual([]);
        });

        it('maps rule failures to SARIF results and rule metadata', () => {
            reporter.report([makeResult('src/app.component.ts', { ruleName: 'prefer-on-push' })]);
            const parsed = JSON.parse(out.lines[0]);

            expect(parsed.runs[0].tool.driver.rules[0].id).toBe('prefer-on-push');
            expect(parsed.runs[0].results[0]).toMatchObject({
                ruleId: 'prefer-on-push',
                level: 'error',
                message: { text: 'Test violation' },
            });
            expect(parsed.runs[0].results[0].locations[0].physicalLocation).toMatchObject({
                artifactLocation: { uri: 'src/app.component.ts' },
                region: { startLine: 3, startColumn: 5 },
            });
        });

        it('maps warn severity to SARIF warning level', () => {
            reporter.report([makeResult('src/app.component.ts', { severity: 'warn' })]);
            const parsed = JSON.parse(out.lines[0]);

            expect(parsed.runs[0].results[0].level).toBe('warning');
        });

        it('sorts results by file path then source position', () => {
            reporter.report([
                {
                    ruleName: 'rule',
                    failures: [
                        { filePath: 'src/z.ts', message: 'z', line: 1, column: 1, severity: 'error', ruleName: 'rule' },
                        { filePath: 'src/a.ts', message: 'b', line: 10, column: 1, severity: 'error', ruleName: 'rule' },
                        { filePath: 'src/a.ts', message: 'a', line: 1, column: 1, severity: 'error', ruleName: 'rule' },
                    ],
                },
            ]);
            const parsed = JSON.parse(out.lines[0]);

            expect(parsed.runs[0].results.map((result: any) => result.message.text)).toEqual(['a', 'b', 'z']);
        });

        it('includes parse errors as tool execution notifications', () => {
            reporter.parseErrors([{ filePath: 'src/broken.ts', message: 'Unexpected token' }]);
            reporter.report([]);
            const parsed = JSON.parse(out.lines[0]);

            expect(parsed.runs[0].invocations[0].executionSuccessful).toBe(true);
            expect(parsed.runs[0].invocations[0].toolExecutionNotifications[0]).toMatchObject({
                level: 'warning',
                message: { text: 'Unexpected token' },
            });
            expect(parsed.runs[0].invocations[0].toolExecutionNotifications[0].locations[0].physicalLocation.artifactLocation.uri)
                .toBe('src/broken.ts');
        });
    });

    describe('summary()', () => {
        it('produces no output', () => {
            reporter.summary({ totalFiles: 1, totalTasks: 1, totalErrors: 0, totalWarnings: 0, duration: 0 });
            expect(out.lines).toHaveLength(0);
        });
    });

    describe('error()', () => {
        it('emits valid JSON error object to stderr', () => {
            reporter.error(new Error('analysis failed'));
            const parsed = JSON.parse(out.errors[0]);

            expect(parsed.error).toBe('analysis failed');
        });
    });
});
