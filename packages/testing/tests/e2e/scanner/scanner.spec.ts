/**
 * Scanner Integration Tests
 *
 * These tests exercise the scanner package end-to-end using real temporary
 * directories on disk. No mocking — every file system interaction is real.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { scan } from '@ngcompass/scanner';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

// ── Fixture helpers ───────────────────────────────────────────────────────

async function createFixtureDir(
    name: string
): Promise<{ rootDir: string; cleanup: () => Promise<void> }> {
    const rootDir = join(tmpdir(), `ngcompass-scanner-test-${name}-${randomUUID()}`);
    await mkdir(rootDir, { recursive: true });
    return {
        rootDir,
        cleanup: () => rm(rootDir, { recursive: true, force: true }),
    };
}

// ── Basic scan ────────────────────────────────────────────────────────────

describe('Scanner integration — basic file discovery', () => {
    let rootDir: string;
    let cleanup: () => Promise<void>;

    beforeAll(async () => {
        ({ rootDir, cleanup } = await createFixtureDir('basic'));

        await mkdir(join(rootDir, 'src'), { recursive: true });
        await writeFile(join(rootDir, 'src', 'app.component.ts'), '// component');
        await writeFile(join(rootDir, 'src', 'app.component.html'), '<div>App</div>');
        await writeFile(join(rootDir, 'src', 'main.ts'), '// main');
    });

    afterAll(() => cleanup());

    it('discovers TypeScript files', async () => {
        const result = await scan({
            rootDir,
            include: ['**/*.ts'],
            exclude: [],
            respectGitignore: false,
        });

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.data.files.some(f => f.endsWith('app.component.ts'))).toBe(true);
        expect(result.data.files.some(f => f.endsWith('main.ts'))).toBe(true);
    });

    it('discovers HTML template files', async () => {
        const result = await scan({
            rootDir,
            include: ['**/*.html'],
            exclude: [],
            respectGitignore: false,
        });

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.data.files.some(f => f.endsWith('app.component.html'))).toBe(true);
    });

    it('respects exclude patterns', async () => {
        const result = await scan({
            rootDir,
            include: ['**/*.ts'],
            exclude: ['**/main.ts'],
            respectGitignore: false,
        });

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.data.files.every(f => !f.endsWith('main.ts'))).toBe(true);
    });

    it('returns accurate stats for discovered files', async () => {
        const result = await scan({
            rootDir,
            include: ['**/*.ts'],
            exclude: [],
            respectGitignore: false,
        });

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.data.stats.totalFiles).toBeGreaterThan(0);
        expect(result.data.stats.byExtension.has('.ts')).toBe(true);
        expect(result.data.timestamp).toBeGreaterThan(0);
    });

    it('returns Err for a non-existent rootDir', async () => {
        const result = await scan({
            rootDir: join(rootDir, 'does-not-exist'),
            include: ['**/*.ts'],
            exclude: [],
        });

        expect(result.ok).toBe(false);
    });
});

// ── Gitignore support ─────────────────────────────────────────────────────

describe('Scanner integration — .gitignore support', () => {
    let rootDir: string;
    let cleanup: () => Promise<void>;

    beforeAll(async () => {
        ({ rootDir, cleanup } = await createFixtureDir('gitignore'));

        await mkdir(join(rootDir, 'src'), { recursive: true });
        await mkdir(join(rootDir, 'dist'), { recursive: true });

        await writeFile(join(rootDir, 'src', 'app.ts'), '// app');
        await writeFile(join(rootDir, 'dist', 'app.js'), '// built');
        await writeFile(join(rootDir, '.gitignore'), 'dist/\n');
    });

    afterAll(() => cleanup());

    it('excludes files matching .gitignore patterns when respectGitignore is true', async () => {
        const result = await scan({
            rootDir,
            include: ['**/*.ts', '**/*.js'],
            exclude: [],
            respectGitignore: true,
        });

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        const hasDistFile = result.data.files.some(f => f.includes('dist'));
        expect(hasDistFile).toBe(false);
    });

    it('includes gitignored files when respectGitignore is false', async () => {
        const result = await scan({
            rootDir,
            include: ['**/*.js'],
            exclude: [],
            respectGitignore: false,
        });

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        const hasDistFile = result.data.files.some(f => f.includes('dist'));
        expect(hasDistFile).toBe(true);
    });
});

// ── Progress callbacks ────────────────────────────────────────────────────

describe('Scanner integration — progress callbacks', () => {
    let rootDir: string;
    let cleanup: () => Promise<void>;

    beforeAll(async () => {
        ({ rootDir, cleanup } = await createFixtureDir('progress'));
        await writeFile(join(rootDir, 'app.ts'), '// app');
    });

    afterAll(() => cleanup());

    it('emits normalizing and complete phases', async () => {
        const phases: string[] = [];

        await scan({
            rootDir,
            include: ['**/*.ts'],
            exclude: [],
            respectGitignore: false,
            onProgress: (phase) => phases.push(phase),
        });

        expect(phases).toContain('normalizing');
        expect(phases).toContain('complete');
    });

    it('emits phases in logical order', async () => {
        const phases: string[] = [];

        await scan({
            rootDir,
            include: ['**/*.ts'],
            exclude: [],
            respectGitignore: false,
            onProgress: (phase) => phases.push(phase),
        });

        const normalizeIdx = phases.indexOf('normalizing');
        const completeIdx = phases.indexOf('complete');
        expect(normalizeIdx).toBeLessThan(completeIdx);
    });
});
