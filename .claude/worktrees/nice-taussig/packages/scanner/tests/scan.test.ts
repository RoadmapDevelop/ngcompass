/**
 * Integration Tests — scan.ts
 *
 * Uses real temporary directories and (where needed) real temporary git repos.
 * No module mocking is required because OS temp directories are naturally
 * outside the project git tree, so isGitRepo() returns false on them (exercises
 * the glob path). Git-path tests spin up their own tiny git repos.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

import { scan } from '../src/scan.js';

let tmpDir: string;

beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'ngcompass-scan-'));
});

afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
});

function opts(overrides: Partial<Parameters<typeof scan>[0]> = {}): Parameters<typeof scan>[0] {
    return {
        rootDir: tmpDir,
        include: ['**/*.ts', '**/*.html'],
        exclude: ['**/node_modules/**'],
        ...overrides,
    };
}

// ---------------------------------------------------------------------------
// Error paths
// ---------------------------------------------------------------------------

describe('scan — error paths', () => {
    it('returns Err when rootDir does not exist', async () => {
        const nonExistent = join(tmpdir(), 'ngcompass-nonexistent-' + Date.now());
        const result = await scan(opts({ rootDir: nonExistent }));
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.error.message).toMatch(/rootDir does not exist/i);
    });
});

// ---------------------------------------------------------------------------
// Glob-based discovery (OS temp dirs are outside the project git tree)
// ---------------------------------------------------------------------------

describe('scan — glob-based discovery', () => {
    it('returns Ok with an empty file list for an empty directory', async () => {
        const result = await scan(opts());
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.data.files).toHaveLength(0);
    });

    it('discovers TypeScript files', async () => {
        await writeFile(join(tmpDir, 'app.component.ts'), 'const x = 1;');
        const result = await scan(opts());
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.data.files.some((f) => f.endsWith('app.component.ts'))).toBe(true);
    });

    it('discovers HTML template files', async () => {
        await writeFile(join(tmpDir, 'app.component.html'), '<div></div>');
        const result = await scan(opts());
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.data.files.some((f) => f.endsWith('app.component.html'))).toBe(true);
    });

    it('respects exclude patterns — node_modules is skipped', async () => {
        await mkdir(join(tmpDir, 'node_modules'), { recursive: true });
        await writeFile(join(tmpDir, 'node_modules', 'dep.ts'), '');
        await writeFile(join(tmpDir, 'app.ts'), '');
        const result = await scan(opts());
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.data.files.some((f) => f.includes('node_modules'))).toBe(false);
        expect(result.data.files.some((f) => f.endsWith('app.ts'))).toBe(true);
    });

    it('returns correct stats — totalFiles and byExtension', async () => {
        await writeFile(join(tmpDir, 'a.ts'), '');
        await writeFile(join(tmpDir, 'b.ts'), '');
        await writeFile(join(tmpDir, 'c.html'), '');
        const result = await scan(opts());
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.data.stats.totalFiles).toBe(3);
        expect(result.data.stats.byExtension.get('.ts')).toBe(2);
        expect(result.data.stats.byExtension.get('.html')).toBe(1);
    });

    it('includes a timestamp within the test window', async () => {
        const before = Date.now();
        const result = await scan(opts());
        const after = Date.now();
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.data.timestamp).toBeGreaterThanOrEqual(before);
        expect(result.data.timestamp).toBeLessThanOrEqual(after);
    });

    it('invokes onProgress callback at each phase', async () => {
        await writeFile(join(tmpDir, 'x.ts'), '');
        const phases: string[] = [];
        const result = await scan(opts({ onProgress: (p) => { phases.push(p); } }));
        expect(result.ok).toBe(true);
        expect(phases).toContain('normalizing');
        expect(phases).toContain('discovering');
        expect(phases).toContain('complete');
    });

    it('uses default include patterns when include is empty', async () => {
        await writeFile(join(tmpDir, 'style.scss'), '');
        const result = await scan({ rootDir: tmpDir, include: [], exclude: [] });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        // Default patterns include **/*.scss
        expect(result.data.files.some((f) => f.endsWith('.scss'))).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// Git-based discovery
// ---------------------------------------------------------------------------

describe('scan — git-based discovery', () => {
    let gitDir: string;

    beforeEach(async () => {
        gitDir = await mkdtemp(join(tmpdir(), 'ngcompass-scan-git-'));
        execSync('git init', { cwd: gitDir, stdio: 'pipe' });
        execSync('git config user.email "ci@test"', { cwd: gitDir, stdio: 'pipe' });
        execSync('git config user.name "CI"', { cwd: gitDir, stdio: 'pipe' });
    });

    afterEach(async () => {
        await rm(gitDir, { recursive: true, force: true });
    });

    it('discovers committed TypeScript files via git', async () => {
        await writeFile(join(gitDir, 'app.component.ts'), 'const x = 1;');
        execSync('git add .', { cwd: gitDir, stdio: 'pipe' });
        execSync('git commit -m "init"', { cwd: gitDir, stdio: 'pipe' });

        const result = await scan(opts({ rootDir: gitDir }));
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.data.files.some((f) => f.endsWith('app.component.ts'))).toBe(true);
    });

    it('falls back to glob when git ls-files returns nothing (empty/no-commit repo)', async () => {
        // git init but no commit → git ls-files returns nothing → glob fallback
        await writeFile(join(gitDir, 'untracked.ts'), 'const y = 2;');
        const result = await scan(opts({ rootDir: gitDir }));
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        // Glob fallback must find the file on disk
        expect(result.data.files.some((f) => f.endsWith('untracked.ts'))).toBe(true);
    });

    it('filters git-discovered files by include patterns — excludes json', async () => {
        await writeFile(join(gitDir, 'app.ts'), '');
        await writeFile(join(gitDir, 'config.json'), '{}');
        execSync('git add .', { cwd: gitDir, stdio: 'pipe' });
        execSync('git commit -m "init"', { cwd: gitDir, stdio: 'pipe' });

        const result = await scan(opts({ rootDir: gitDir }));
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.data.files.some((f) => f.endsWith('app.ts'))).toBe(true);
        expect(result.data.files.some((f) => f.endsWith('config.json'))).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// tsconfig integration
// ---------------------------------------------------------------------------

describe('scan — tsconfig pattern merging', () => {
    it('merges tsconfig include patterns when tsConfigPath is provided', async () => {
        await writeFile(join(tmpDir, 'app.ts'), '');
        const tsConfigPath = join(tmpDir, 'tsconfig.json');
        await writeFile(tsConfigPath, JSON.stringify({ include: ['**/*.ts'], exclude: [] }));

        const result = await scan(opts({ tsConfigPath }));
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.data.files.some((f) => f.endsWith('app.ts'))).toBe(true);
    });

    it('continues normally when tsConfigPath points to a missing file', async () => {
        await writeFile(join(tmpDir, 'app.ts'), '');
        const result = await scan(opts({ tsConfigPath: join(tmpDir, 'missing.json') }));
        // Must not crash — proceeds without tsconfig patterns
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.data.files.some((f) => f.endsWith('app.ts'))).toBe(true);
    });
});
