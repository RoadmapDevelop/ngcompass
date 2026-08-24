import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Command } from 'commander';
import { createCacheContext } from '@ngcompass/cache';
import { registerAllBuiltinRules } from '@ngcompass/rules';
import { registerAnalyzeCommand } from '../../src/commands/analyze/index.js';
import { registerBaselineCommand } from '../../src/commands/baseline.js';

const RULE = 'prefer-on-push-component-change-detection';
const TEMPLATE_RULE = 'template-trackby-required';
const BASELINE_PATH = '.ngcompass/baseline.json';

function componentSource(className: string): string {
  return `import { Component } from '@angular/core';

@Component({
  selector: 'app-${className.toLowerCase()}',
  template: '<div *ngFor="let item of items">{{ item }}</div>',
})
export class ${className} {
  items = [1, 2, 3];
}
`;
}

function configSource(cacheEnabled = false): string {
  return `module.exports = {
  include: ['src/**/*.ts'],
  exclude: ['**/node_modules/**'],
  maxWorkers: 1,
  cache: ${cacheEnabled},
  rules: { '${RULE}': 'error', '${TEMPLATE_RULE}': 'error' },
  baseline: { enabled: true, path: '${BASELINE_PATH}' },
};
`;
}

describe('baseline end to end', { timeout: 60000 }, () => {
  let projectDir: string;
  let originalCwd: string;
  let exitCode: number | undefined;
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let stdout: string[];

  async function run(argv: string[]): Promise<void> {
    exitCode = undefined;
    const program = new Command();
    program.exitOverride();
    const cache = createCacheContext({ strategy: 'memory' });
    registerAnalyzeCommand(program, cache);
    registerBaselineCommand(program, cache);
    await program.parseAsync(['node', 'ngcompass', ...argv]);
  }

  async function writeComponent(
    name: string,
    className: string
  ): Promise<void> {
    await writeFile(
      path.join(projectDir, 'src', name),
      componentSource(className),
      'utf8'
    );
  }

  async function readBaseline(): Promise<Record<string, unknown>> {
    const raw = await readFile(path.join(projectDir, BASELINE_PATH), 'utf8');
    return JSON.parse(raw);
  }

  beforeAll(() => {
    registerAllBuiltinRules();
  });

  beforeEach(async () => {
    originalCwd = process.cwd();
    projectDir = await mkdtemp(
      path.join(os.tmpdir(), 'ngcompass-baseline-e2e-')
    );
    await mkdir(path.join(projectDir, 'src'), { recursive: true });
    await writeFile(
      path.join(projectDir, 'ngcompass.config.cjs'),
      configSource(),
      'utf8'
    );
    await writeComponent('a.component.ts', 'AComponent');
    await writeComponent('b.component.ts', 'BComponent');
    process.chdir(projectDir);

    stdout = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      stdout.push(String(chunk));
      return true;
    });
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      exitCode = code ?? 0;
      return undefined;
    }) as never);
  });

  afterEach(async () => {
    exitSpy.mockRestore();
    vi.restoreAllMocks();
    process.chdir(originalCwd);
    await rm(projectDir, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 100,
    });
  });

  it('records every existing violation when the baseline is created', async () => {
    await run(['baseline', 'create']);

    const baseline = await readBaseline();
    expect(baseline).toEqual({
      version: 1,
      entries: {
        'src/a.component.ts': { [RULE]: 1, [TEMPLATE_RULE]: 1 },
        'src/b.component.ts': { [RULE]: 1, [TEMPLATE_RULE]: 1 },
      },
    });
  });

  it('passes analysis once the existing violations are baselined', async () => {
    await run(['baseline', 'create']);
    await run(['analyze']);

    expect(exitCode).toBeUndefined();
  });

  it('fails analysis when a new violation is introduced', async () => {
    await run(['baseline', 'create']);
    await writeComponent('c.component.ts', 'CComponent');
    await run(['analyze']);

    expect(exitCode).toBe(1);
  });

  it('keeps passing after a baselined file moves to a new folder', async () => {
    await run(['baseline', 'create']);
    await mkdir(path.join(projectDir, 'src', 'features'), { recursive: true });
    await writeComponent('features/a.component.ts', 'AComponent');
    await rm(path.join(projectDir, 'src', 'a.component.ts'));
    await run(['analyze']);

    expect(exitCode).toBeUndefined();
  });

  it('reports every violation again when the baseline is disabled', async () => {
    await run(['baseline', 'create']);
    await run(['analyze', '--no-baseline']);

    expect(exitCode).toBe(1);
  });

  it('lowers recorded counts once a violation is fixed and pruned', async () => {
    await run(['baseline', 'create']);
    await rm(path.join(projectDir, 'src', 'b.component.ts'));
    await run(['baseline', 'prune']);

    const baseline = await readBaseline();
    expect(baseline['entries']).toEqual({
      'src/a.component.ts': { [RULE]: 1, [TEMPLATE_RULE]: 1 },
    });
  });

  it('refuses to overwrite an existing baseline without --force', async () => {
    await run(['baseline', 'create']);
    await run(['baseline', 'create']);

    expect(exitCode).toBe(1);
  });

  it('never persists baseline-filtered results into the result cache', async () => {
    await writeFile(
      path.join(projectDir, 'ngcompass.config.cjs'),
      configSource(true),
      'utf8'
    );
    await rm(path.join(projectDir, 'src', 'b.component.ts'));
    await mkdir(path.join(projectDir, '.ngcompass'), { recursive: true });
    await writeFile(
      path.join(projectDir, BASELINE_PATH),
      JSON.stringify({
        version: 1,
        entries: { 'src/a.component.ts': { [RULE]: 1 } },
      }),
      'utf8'
    );

    await run(['analyze']);

    await writeComponent('c.component.ts', 'CComponent');
    stdout = [];
    await run(['analyze', '--no-baseline']);

    expect(stdout.join('')).toContain('4 violations');
  });

  it('reports the hidden count in the console summary', async () => {
    await run(['baseline', 'create']);
    stdout = [];
    await run(['analyze']);

    expect(stdout.join('')).toContain('hidden by baseline');
  });
});
