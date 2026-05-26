import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HtmlReporter, resolveBrowserLaunch } from '../src/reporters/html-reporter.js';
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
    fix: 'Move this value into a safe, typed binding first.',
    ...overrides,
  };
}

function makeResult(failure: RuleFailure = makeFailure()): RuleResult {
  return {
    ruleName: failure.ruleName,
    failures: [failure],
  };
}

function setPlatform(platform: NodeJS.Platform): () => void {
  const original = process.platform;
  Object.defineProperty(process, 'platform', { value: platform });
  return () => Object.defineProperty(process, 'platform', { value: original });
}

describe('HtmlReporter', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'ngcompass-html-'));
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(tempDir, { recursive: true, force: true });
  });

  async function renderHtml(
    results: ReadonlyArray<RuleResult>,
    parseErrors: ReadonlyArray<ParseError> = [],
    summaryOverrides: Partial<ResultSummary> = {}
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
      failOnSeverity: 'error',
      maxWarnings: 10,
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
    expect(html).toContain(
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAfQAAAH0CAYAAADL1t+K'
    );
    expect(html).toContain('Errors');
    expect(html).toContain('Warnings');
    expect(html).toContain('Violations');
    expect(html).toContain('status-indicator fail');
    expect(html).toContain('FAILED');
    expect(html).toContain('Category breakdown');
    expect(html).toContain('id="categoryFilter"');
    expect(html).toContain('id="ruleFilter"');
    expect(html).toContain('id="themeToggle"');
    expect(html).toContain('theme-icon-moon');
    expect(html).toContain('theme-icon-sun');
    expect(html).toContain('data-theme');
    expect(html).toContain('cat-performance');
    expect(html).toContain('badge badge-error');
    expect(html).toContain('src/app.component.ts');
    expect(html).toContain('test-rule');
    expect(html).toContain('Unsafe &lt;template&gt; &amp; binding');
    expect(html).toContain('recommendation-label');
    expect(html).toContain('Move this value into a safe, typed binding first.');
    expect(out.errors[0]).toContain('Report saved:');
  });

  it('renders inline source context when the source file is available', async () => {
    const sourceDir = join(tempDir, 'src');
    const sourcePath = join(sourceDir, 'app.component.ts');
    await mkdir(sourceDir, { recursive: true });
    await writeFile(
      sourcePath,
      [
        'import { Component } from "@angular/core";',
        '',
        '@Component({',
        '  selector: "app-root",',
        '  template: "<button>{{ computeLabel() }}</button>",',
        '})',
        'export class AppComponent {}',
      ].join('\n')
    );

    const { html } = await renderHtml([
      makeResult(
        makeFailure({
          filePath: sourcePath,
          line: 5,
          column: 18,
          ruleName: 'template-no-call-expression',
        })
      ),
    ]);

    expect(html).toContain('Source context');
    expect(html).toContain('class="code-line is-hit"');
    expect(html).toContain('&lt;button&gt;{{ computeLabel() }}&lt;/button&gt;');
    expect(html).toContain('data-category="Performance"');
  });

  it('renders parse errors with escaped content', async () => {
    const { html } = await renderHtml(
      [],
      [
        {
          filePath: join(process.cwd(), 'src/broken.component.ts'),
          message: 'Unexpected <token> & EOF',
        },
      ],
      {
        totalErrors: 0,
        totalWarnings: 0,
      }
    );

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
    expect(html).toContain('status-indicator pass');
    expect(html).toContain('PASS');
    expect(html).toContain('No violations found');
    expect(html).toContain('No violations found across 3 files.');
  });

  it('renders pass-with-warnings status when warnings are below the failure threshold', async () => {
    const { html } = await renderHtml(
      [makeResult(makeFailure({ severity: 'warn' }))],
      [],
      {
        totalErrors: 0,
        totalWarnings: 1,
        maxWarnings: 10,
      }
    );

    expect(html).toContain('status-indicator warn');
    expect(html).toContain('WARN');
  });

  it('resolves the Windows fallback to a file URL browser launch', () => {
    const outputPath = join(tempDir, 'report.html');
    const restorePlatform = setPlatform('win32');
    vi.spyOn(fs, 'existsSync').mockReturnValue(false);

    const launch = (() => {
      try {
        return resolveBrowserLaunch(outputPath);
      } finally {
        restorePlatform();
      }
    })();

    expect(launch).toEqual({
      command: 'cmd',
      args: ['/c', 'start', '', pathToFileURL(outputPath).href],
      windowsHide: true,
    });
  });
});
