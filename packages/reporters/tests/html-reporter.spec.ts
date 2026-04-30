import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HtmlReporter } from '../src/reporters/html-reporter.js';
import { createTestOutput } from '../src/output.js';
import type { RuleFailure, RuleResult } from '@ngcompass/common';
import type { ParseError, ResultSummary } from '../src/types.js';

function makeFailure(overrides: Partial<RuleFailure> = {}): RuleFailure {
    return {
        filePath: join(process.cwd(), 'src/app.component.ts'),
        message: 'Unsafe <template> & binding',
        line: 7,
        column: 3,
        severity: 'error',
        ruleName: 'test-rule',
        ...overrides,
    };
}

function makeResult(failure: RuleFailure = makeFailure()): RuleResult {
    return {
        ruleName: failure.ruleName,
        failures: [failure],
    };
}

describe('HtmlReporter', () => {
    let tempDir: string;

    beforeEach(async () => {
        tempDir = await mkdtemp(join(tmpdir(), 'ngcompass-html-'));
    });

    afterEach(async () => {
        await rm(tempDir, { recursive: true, force: true });
    });

    async function renderHtml(
        results: ReadonlyArray<RuleResult>,
        parseErrors: ReadonlyArray<ParseError> = [],
        summaryOverrides: Partial<ResultSummary> = {},
    ): Promise<{ html: string; out: ReturnType<typeof createTestOutput> }> {
        const outputPath = join(tempDir, 'report.html');
        const out = createTestOutput();
        const reporter = new HtmlReporter(outputPath, out.output);

        reporter.parseErrors(parseErrors);
        reporter.report(results);
        reporter.summary({
            totalFiles: 1,
            totalTasks: 1,
            totalErrors: 1,
            totalWarnings: 0,
            duration: 42,
            ...summaryOverrides,
        });

        return {
            html: await readFile(outputPath, 'utf8'),
            out,
        };
    }

    it('renders the embedded brand logo and issue summary cards', async () => {
        const { html, out } = await renderHtml([makeResult()]);

        expect(html).toContain('class="brand-logo"');
        expect(html).toContain('data:image/png;base64,');
        expect(html).toContain('Errors');
        expect(html).toContain('Warnings');
        expect(html).toContain('Violations');
        expect(html).toContain('badge badge-error');
        expect(html).toContain('src/app.component.ts');
        expect(html).toContain('test-rule');
        expect(html).toContain('Unsafe &lt;template&gt; &amp; binding');
        expect(out.errors[0]).toContain('Report saved:');
    });

    it('renders parse errors with escaped content', async () => {
        const { html } = await renderHtml([], [
            {
                filePath: join(process.cwd(), 'src/broken.component.ts'),
                message: 'Unexpected <token> & EOF',
            },
        ], {
            totalErrors: 0,
            totalWarnings: 0,
        });

        expect(html).toContain('Parse errors');
        expect(html).toContain('parse-item');
        expect(html).toContain('src/broken.component.ts');
        expect(html).toContain('Unexpected &lt;token&gt; &amp; EOF');
    });

    it('renders the clean-state report when there are no violations', async () => {
        const { html } = await renderHtml([], [], {
            totalFiles: 3,
            totalTasks: 3,
            totalErrors: 0,
            totalWarnings: 0,
        });

        expect(html).toContain('Analysis Passed');
        expect(html).toContain('No violations found');
        expect(html).toContain('No violations found across 3 scanned files.');
    });
});
