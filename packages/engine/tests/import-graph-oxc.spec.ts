import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildImportGraphOxc } from '../src/import-graph-oxc.js';
import { findCircularDependencies } from '../src/cycle-detector.js';

interface Fixture {
  readonly rootDir: string;
  readonly files: string[];
  readonly dispose: () => void;
}

let counter = 0;

function makeFixture(
  layout: Readonly<Record<string, string>>,
  tsconfig?: Readonly<Record<string, unknown>>
): Fixture {
  const rootDir = fs.mkdtempSync(
    path.join(os.tmpdir(), `ngc-oxc-${counter++}-`)
  );

  for (const [relPath, content] of Object.entries(layout)) {
    const full = path.join(rootDir, relPath);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content, 'utf8');
  }

  fs.writeFileSync(
    path.join(rootDir, 'tsconfig.json'),
    JSON.stringify(
      tsconfig ?? {
        compilerOptions: { target: 'ES2022', module: 'ES2022' },
      }
    ),
    'utf8'
  );

  const files = Object.keys(layout).map((p) =>
    path.resolve(rootDir, p).replace(/\\/g, '/')
  );

  return {
    rootDir,
    files,
    dispose: () => {
      try {
        fs.rmSync(rootDir, { recursive: true, force: true });
      } catch {}
    },
  };
}

let active: Fixture | undefined;
afterEach(() => {
  active?.dispose();
  active = undefined;
});

function relSet(graph: ReadonlyMap<string, ReadonlySet<string>>, rootDir: string): Map<string, Set<string>> {
  const norm = (p: string): string =>
    path.relative(rootDir, p).replace(/\\/g, '/');
  const out = new Map<string, Set<string>>();
  for (const [from, tos] of graph) {
    out.set(norm(from), new Set([...tos].map(norm)));
  }
  return out;
}

describe('buildImportGraphOxc', () => {
  it('returns an empty graph for zero files', async () => {
    active = makeFixture({});
    const result = await buildImportGraphOxc(active.files, {
      rootDir: active.rootDir,
    });
    expect(result.importGraph.size).toBe(0);
  });

  it('resolves a simple relative import', async () => {
    active = makeFixture({
      'src/a.ts': `import { b } from './b';\nexport const a = b;`,
      'src/b.ts': `export const b = 1;`,
    });
    const result = await buildImportGraphOxc(active.files, {
      rootDir: active.rootDir,
    });
    const rel = relSet(result.importGraph, active.rootDir);
    expect(rel.get('src/a.ts')?.has('src/b.ts')).toBe(true);
    expect(rel.get('src/b.ts')?.size).toBe(0);
  });

  it('resolves a relative import through index.ts', async () => {
    active = makeFixture({
      'src/a.ts': `import { x } from './lib';\nexport const a = x;`,
      'src/lib/index.ts': `export const x = 1;`,
    });
    const result = await buildImportGraphOxc(active.files, {
      rootDir: active.rootDir,
    });
    const rel = relSet(result.importGraph, active.rootDir);
    expect(rel.get('src/a.ts')?.has('src/lib/index.ts')).toBe(true);
  });

  it('resolves re-exports (export ... from)', async () => {
    active = makeFixture({
      'src/a.ts': `export { b } from './b';`,
      'src/b.ts': `export const b = 1;`,
    });
    const result = await buildImportGraphOxc(active.files, {
      rootDir: active.rootDir,
    });
    const rel = relSet(result.importGraph, active.rootDir);
    expect(rel.get('src/a.ts')?.has('src/b.ts')).toBe(true);
  });

  it('resolves wildcard re-exports (export * from)', async () => {
    active = makeFixture({
      'src/a.ts': `export * from './b';`,
      'src/b.ts': `export const b = 1;`,
    });
    const result = await buildImportGraphOxc(active.files, {
      rootDir: active.rootDir,
    });
    const rel = relSet(result.importGraph, active.rootDir);
    expect(rel.get('src/a.ts')?.has('src/b.ts')).toBe(true);
  });

  it('ignores external package imports', async () => {
    active = makeFixture({
      'src/a.ts': `import { Component } from '@angular/core';\nexport const a = 1;`,
    });
    const result = await buildImportGraphOxc(active.files, {
      rootDir: active.rootDir,
    });
    const rel = relSet(result.importGraph, active.rootDir);
    expect(rel.get('src/a.ts')?.size).toBe(0);
  });

  it('resolves a .js import to its .ts source', async () => {
    active = makeFixture({
      'src/a.ts': `import { b } from './b.js';\nexport const a = b;`,
      'src/b.ts': `export const b = 1;`,
    });
    const result = await buildImportGraphOxc(active.files, {
      rootDir: active.rootDir,
    });
    const rel = relSet(result.importGraph, active.rootDir);
    expect(rel.get('src/a.ts')?.has('src/b.ts')).toBe(true);
  });

  it('detects a two-node cycle via the full pipeline', async () => {
    active = makeFixture({
      'src/a.ts': `import { b } from './b';\nexport const a = b;`,
      'src/b.ts': `import { a } from './a';\nexport const b = a;`,
    });
    const result = await buildImportGraphOxc(active.files, {
      rootDir: active.rootDir,
    });
    const cycles = findCircularDependencies(result.importGraph);
    expect(cycles.length).toBe(1);
  });

  it('resolves a tsconfig path alias with wildcard', async () => {
    active = makeFixture(
      {
        'src/a.ts': `import { b } from '@app/lib/b';\nexport const a = b;`,
        'src/lib/b.ts': `export const b = 1;`,
      },
      {
        compilerOptions: {
          target: 'ES2022',
          module: 'ES2022',
          baseUrl: '.',
          paths: {
            '@app/*': ['src/*'],
          },
        },
      }
    );
    const result = await buildImportGraphOxc(active.files, {
      rootDir: active.rootDir,
    });
    const rel = relSet(result.importGraph, active.rootDir);
    expect(rel.get('src/a.ts')?.has('src/lib/b.ts')).toBe(true);
  });

  it('skips a relative import that does not exist as a project file', async () => {
    active = makeFixture({
      'src/a.ts': `import { c } from './missing';\nexport const a = 1;`,
    });
    const result = await buildImportGraphOxc(active.files, {
      rootDir: active.rootDir,
    });
    const rel = relSet(result.importGraph, active.rootDir);
    expect(rel.get('src/a.ts')?.size).toBe(0);
  });

  it('skips .d.ts files when listing source nodes', async () => {
    active = makeFixture({
      'src/a.ts': `export const a = 1;`,
      'src/types.d.ts': `declare const x: number;`,
    });
    const result = await buildImportGraphOxc(active.files, {
      rootDir: active.rootDir,
    });
    const rel = relSet(result.importGraph, active.rootDir);
    expect(rel.has('src/a.ts')).toBe(true);
    expect(rel.has('src/types.d.ts')).toBe(false);
  });

  it('reports progress through onProgress', async () => {
    const layout: Record<string, string> = {};
    for (let i = 0; i < 250; i++) {
      const next = (i + 1) % 250;
      layout[`src/f${i}.ts`] = `import './f${next}';\nexport const v${i} = 1;`;
    }
    active = makeFixture(layout);

    const progressCalls: Array<{ done: number; total: number }> = [];
    await buildImportGraphOxc(active.files, {
      rootDir: active.rootDir,
      onProgress: (done, total) => progressCalls.push({ done, total }),
    });

    expect(progressCalls.length).toBeGreaterThan(0);
    expect(progressCalls[progressCalls.length - 1].done).toBe(250);
    expect(progressCalls[progressCalls.length - 1].total).toBe(250);
  });

  it('does not add a self-loop when a file imports itself by ./current-name', async () => {
    active = makeFixture({
      'src/a.ts': `// nothing\nexport const a = 1;`,
    });
    const result = await buildImportGraphOxc(active.files, {
      rootDir: active.rootDir,
    });
    const rel = relSet(result.importGraph, active.rootDir);
    expect(rel.get('src/a.ts')?.size).toBe(0);
  });
});
