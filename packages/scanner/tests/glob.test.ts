import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { executeGlob, patternsLikelyHaveMatches } from '../src/glob.js';

let tmpDir: string;

beforeAll(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'ngcompass-glob-'));
  await writeFile(join(tmpDir, 'app.component.ts'), '');
  await writeFile(join(tmpDir, 'app.component.html'), '');
  await writeFile(join(tmpDir, 'app.component.spec.ts'), '');
  await writeFile(join(tmpDir, 'app.component.scss'), '');
  await mkdir(join(tmpDir, 'node_modules'), { recursive: true });
  await writeFile(join(tmpDir, 'node_modules', 'some-lib.ts'), '');
  await mkdir(join(tmpDir, 'sub'), { recursive: true });
  await writeFile(join(tmpDir, 'sub', 'child.component.ts'), '');
});

afterAll(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe('executeGlob', () => {
  it('returns Ok with matching files', async () => {
    const result = await executeGlob(
      { include: ['**/*.ts'], ignore: [] },
      tmpDir,
      { followSymlinks: false, dot: false }
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const names = result.data.files.map((f) => f.split(/[\\/]/).pop());
    expect(names).toContain('app.component.ts');
    expect(names).toContain('app.component.spec.ts');
    expect(names).toContain('child.component.ts');
  });

  it('returns absolute paths for every discovered file', async () => {
    const result = await executeGlob(
      { include: ['**/*.ts'], ignore: [] },
      tmpDir,
      { followSymlinks: false, dot: false }
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (const file of result.data.files) {
      expect(file).toMatch(
        /^([A-Z]:[\\/]|\/)/,
        `Expected absolute path, got: ${file}`
      );
    }
  });

  it('respects ignore patterns — node_modules excluded', async () => {
    const result = await executeGlob(
      { include: ['**/*.ts'], ignore: ['**/node_modules/**'] },
      tmpDir,
      { followSymlinks: false, dot: false }
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const hasNodeModules = result.data.files.some((f) =>
      f.includes('node_modules')
    );
    expect(hasNodeModules).toBe(false);
  });

  it('filters by extension — only HTML files', async () => {
    const result = await executeGlob(
      { include: ['**/*.html'], ignore: [] },
      tmpDir,
      { followSymlinks: false, dot: false }
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.files).toHaveLength(1);
    expect(result.data.files[0]).toMatch(/\.html$/);
  });

  it('excludes spec files when ignore pattern targets them', async () => {
    const result = await executeGlob(
      { include: ['**/*.ts'], ignore: ['**/*.spec.ts'] },
      tmpDir,
      { followSymlinks: false, dot: false }
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const hasSpec = result.data.files.some((f) => f.endsWith('.spec.ts'));
    expect(hasSpec).toBe(false);
  });

  it('returns an empty file list when no patterns match', async () => {
    const result = await executeGlob(
      { include: ['**/*.nonexistent-ext-xyz'], ignore: [] },
      tmpDir,
      { followSymlinks: false, dot: false }
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.files).toHaveLength(0);
  });

  it('discovers files in subdirectories', async () => {
    const result = await executeGlob(
      { include: ['**/*.ts'], ignore: ['**/node_modules/**'] },
      tmpDir,
      { followSymlinks: false, dot: false }
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.files.some((f) => f.includes('sub'))).toBe(true);
  });

  it('supports multiple include patterns', async () => {
    const result = await executeGlob(
      { include: ['**/*.ts', '**/*.html'], ignore: ['**/node_modules/**'] },
      tmpDir,
      { followSymlinks: false, dot: false }
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const exts = new Set(result.data.files.map((f) => f.split('.').pop()));
    expect(exts.has('ts')).toBe(true);
    expect(exts.has('html')).toBe(true);
  });
});

describe('patternsLikelyHaveMatches', () => {
  it('returns false when the include array is empty', () => {
    expect(patternsLikelyHaveMatches({ include: [], ignore: [] })).toBe(false);
  });

  it('returns false when every include pattern is an exclusion (starts with !)', () => {
    expect(
      patternsLikelyHaveMatches({
        include: ['!**/*.ts', '!**/*.html'],
        ignore: [],
      })
    ).toBe(false);
  });

  it('returns true when there is at least one non-negation include pattern', () => {
    expect(
      patternsLikelyHaveMatches({ include: ['**/*.ts'], ignore: [] })
    ).toBe(true);
  });

  it('returns true when mixed negation and positive include patterns are present', () => {
    expect(
      patternsLikelyHaveMatches({
        include: ['**/*.ts', '!**/*.spec.ts'],
        ignore: [],
      })
    ).toBe(true);
  });

  it('returns true regardless of ignore array contents', () => {
    expect(
      patternsLikelyHaveMatches({
        include: ['**/*.ts'],
        ignore: ['**/node_modules/**', '**/*.spec.ts'],
      })
    ).toBe(true);
  });
});
