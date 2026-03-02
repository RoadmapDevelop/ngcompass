import { describe, it, expect, vi, beforeEach } from 'vitest';
import { exec } from 'node:child_process';
import { stat } from 'node:fs/promises';
import { isGitRepo, executeGitDiscovery, getRepoFingerprint } from '../src/git.js';

vi.mock('node:child_process', () => ({
    exec: vi.fn()
}));

vi.mock('node:fs/promises', () => ({
    stat: vi.fn()
}));

describe('isGitRepo', () => {
    beforeEach(() => { vi.clearAllMocks(); });

    it('returns true if command succeeds', async () => {
        vi.mocked(exec).mockImplementation((cmd: any, opts: any, cb: any) => {
            cb(null, { stdout: 'true\n' }, '');
            return {} as any;
        });
        const result = await isGitRepo('/fake/dir');
        expect(result).toBe(true);
    });

    it('returns false if command fails', async () => {
        vi.mocked(exec).mockImplementation((cmd: any, opts: any, cb: any) => {
            cb(new Error('fatal: not a git repository'), null, null);
            return {} as any;
        });
        const result = await isGitRepo('/fake/dir');
        expect(result).toBe(false);
    });
});

describe('executeGitDiscovery', () => {
    beforeEach(() => { vi.clearAllMocks(); });

    it('returns absolute paths from git ls-files', async () => {
        vi.mocked(exec).mockImplementation((cmd: any, opts: any, cb: any) => {
            cb(null, { stdout: 'file1.ts\nfile2.html\n\n' }, '');
            return {} as any;
        });

        const result = await executeGitDiscovery('/root');

        expect(result.length).toBe(2);
        expect(result[0].replace(/\\/g, '/')).toMatch(/\/root\/file1\.ts$/);
        expect(result[1].replace(/\\/g, '/')).toMatch(/\/root\/file2\.html$/);
    });

    it('returns empty array on error', async () => {
        vi.mocked(exec).mockImplementation((cmd: any, opts: any, cb: any) => {
            cb(new Error('fail'), null, null);
            return {} as any;
        });

        const result = await executeGitDiscovery('/root');
        expect(result).toEqual([]);
    });
});

describe('getRepoFingerprint', () => {
    beforeEach(() => { vi.clearAllMocks(); });

    it('returns combined head and index mtime', async () => {
        vi.mocked(exec).mockImplementation((cmd: any, opts: any, cb: any) => {
            if (cmd.includes('HEAD')) {
                cb(null, { stdout: 'abcdef123456\n' }, '');
            } else {
                cb(null, { stdout: '/fake/root\n' }, '');
            }
            return {} as any;
        });
        vi.mocked(stat).mockResolvedValue({ mtime: { getTime: () => 1000000 } } as any);

        const result = await getRepoFingerprint('/root');
        expect(result).toBe('abcdef123456-1000000');
    });

    it('falls back to HEAD only if stat fails', async () => {
        vi.mocked(exec).mockImplementation((cmd: any, opts: any, cb: any) => {
            cb(null, { stdout: 'abcdef123456\n' }, '');
            return {} as any;
        });
        vi.mocked(stat).mockRejectedValue(new Error('no index'));

        const result = await getRepoFingerprint('/root');
        expect(result).toBe('abcdef123456');
    });

    it('returns empty string if rev-parse fails', async () => {
        vi.mocked(exec).mockImplementation((cmd: any, opts: any, cb: any) => {
            cb(new Error('not a git repo'), null, null);
            return {} as any;
        });

        const result = await getRepoFingerprint('/root');
        expect(result).toBe('');
    });
});
