import { describe, it, expect, vi, beforeEach } from 'vitest';
import { scan } from '../src/scan.js';
import * as git from '../src/git.js';
import * as glob from '../src/glob.js';
import * as gitignore from '../src/gitignore.js';
import { CacheContext } from '@ngcompass/cache';
import type { ScanOptions } from '../src/types.js';

// Allow rootDir existence check to pass for all fake paths in tests.
vi.mock('node:fs/promises', () => ({
    access: vi.fn().mockResolvedValue(undefined),
    stat: vi.fn().mockResolvedValue({ size: 0 })
}));

vi.mock('../src/git.js', () => ({
    isGitRepo: vi.fn(),
    executeGitDiscovery: vi.fn(),
    getRepoFingerprint: vi.fn(),
    getDirectoryFingerprint: vi.fn()
}));

vi.mock('../src/glob.js', () => ({
    executeGlob: vi.fn(),
    patternsLikelyHaveMatches: vi.fn()
}));

vi.mock('../src/gitignore.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../src/gitignore.js')>();
    return {
        ...actual,
        loadAndCreateGitignoreFilter: vi.fn()
    };
});

describe('scan', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        vi.mocked(git.isGitRepo).mockResolvedValue(false);
        vi.mocked(gitignore.loadAndCreateGitignoreFilter).mockResolvedValue({
            ok: true,
            data: vi.fn().mockReturnValue(true)
        } as any);
        vi.mocked(glob.executeGlob).mockResolvedValue({
            ok: true,
            data: { files: ['/fake/a.ts'] }
        } as any);
    });

    it('uses standard glob when not in git repo', async () => {
        const options: ScanOptions = {
            rootDir: '/fake',
            include: ['**/*.ts'],
            exclude: []
        };

        const result = await scan(options);

        expect(result.ok).toBe(true);
        expect(glob.executeGlob).toHaveBeenCalled();
        expect(git.executeGitDiscovery).not.toHaveBeenCalled();

        if (result.ok) {
            expect(result.data.files).toEqual(['/fake/a.ts']);
            expect(result.data.stats.totalFiles).toBe(1);
        }
    });

    it('uses git discovery when in git repo', async () => {
        vi.mocked(git.isGitRepo).mockResolvedValue(true);
        vi.mocked(git.executeGitDiscovery).mockResolvedValue(['/fake/b.ts']);

        const options: ScanOptions = {
            rootDir: '/fake',
            include: ['**/*.ts'],
            exclude: []
        };

        const result = await scan(options);

        expect(result.ok).toBe(true);
        expect(git.executeGitDiscovery).toHaveBeenCalled();
        expect(glob.executeGlob).not.toHaveBeenCalled();

        if (result.ok) {
            expect(result.data.files).toEqual(['/fake/b.ts']);
        }
    });

    it('returns error when discovery fails', async () => {
        vi.mocked(glob.executeGlob).mockResolvedValue({
            ok: false,
            error: new Error('Discovery error')
        });

        const options: ScanOptions = {
            rootDir: '/fake',
            include: ['**/*.ts'],
            exclude: []
        };

        const result = await scan(options);

        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.error.message).toContain('Discovery error');
        }
    });

    it('returns error when rootDir does not exist', async () => {
        const { access } = await import('node:fs/promises');
        vi.mocked(access).mockRejectedValueOnce(new Error('ENOENT'));

        const options: ScanOptions = {
            rootDir: '/does/not/exist',
            include: ['**/*.ts'],
            exclude: []
        };

        const result = await scan(options);

        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.error.message).toContain('rootDir does not exist');
            expect(result.error.message).toContain('/does/not/exist');
        }
    });

    it('integrates with cache if provided', async () => {
        vi.mocked(git.isGitRepo).mockResolvedValue(true);
        vi.mocked(git.getRepoFingerprint).mockResolvedValue('fingerprint_123');

        const cacheMock = {
            computeHash: vi.fn().mockReturnValue('hash123'),
            files: {
                get: vi.fn().mockResolvedValue({ files: ['/fake/cached.ts'] }),
                set: vi.fn()
            }
        } as unknown as CacheContext;

        const options: ScanOptions = {
            rootDir: '/fake',
            include: ['**/*.ts'],
            exclude: [],
            cache: cacheMock
        };

        const result = await scan(options);

        expect(result.ok).toBe(true);
        expect(git.executeGitDiscovery).not.toHaveBeenCalled();
        expect(glob.executeGlob).not.toHaveBeenCalled();

        if (result.ok) {
            expect(result.data.files).toEqual(['/fake/cached.ts']);
            expect(result.data.stats.cacheHit).toBe(true);
        }
    });
});
