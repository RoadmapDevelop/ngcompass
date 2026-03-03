import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { exec, spawn } from 'node:child_process';
import { stat } from 'node:fs/promises';
import { isGitRepo, executeGitDiscovery, getRepoFingerprint, getDirectoryFingerprint } from '../src/git.js';

vi.mock('node:child_process', () => ({
    exec: vi.fn(),
    spawn: vi.fn()
}));

vi.mock('node:fs/promises', () => ({
    stat: vi.fn()
}));

/** Creates a fake ChildProcess whose stdout emits `data` then the process emits `close`. */
function makeSpawnMock(data: string, exitCode: number = 0) {
    const stdout = new EventEmitter() as any;
    stdout.setEncoding = vi.fn();

    const child = new EventEmitter() as any;
    child.stdout = stdout;

    // Emit asynchronously so the listeners are registered before the events fire.
    setImmediate(() => {
        stdout.emit('data', data);
        child.emit('close', exitCode);
    });

    return child;
}

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

    it('returns absolute paths from git ls-files output', async () => {
        vi.mocked(spawn).mockReturnValue(makeSpawnMock('file1.ts\nfile2.html\n\n') as any);

        const result = await executeGitDiscovery('/root');

        expect(result.length).toBe(2);
        expect(result[0].replace(/\\/g, '/')).toMatch(/\/root\/file1\.ts$/);
        expect(result[1].replace(/\\/g, '/')).toMatch(/\/root\/file2\.html$/);
    });

    it('returns empty array when process exits with non-zero code', async () => {
        vi.mocked(spawn).mockReturnValue(makeSpawnMock('', 128) as any);

        const result = await executeGitDiscovery('/root');
        expect(result).toEqual([]);
    });

    it('returns empty array when spawn emits an error event', async () => {
        const stdout = new EventEmitter() as any;
        stdout.setEncoding = vi.fn();
        const child = new EventEmitter() as any;
        child.stdout = stdout;
        setImmediate(() => child.emit('error', new Error('ENOENT: git not found')));

        vi.mocked(spawn).mockReturnValue(child as any);

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

describe('getDirectoryFingerprint', () => {
    beforeEach(() => { vi.clearAllMocks(); });

    it('returns a dir-prefixed mtime fingerprint', async () => {
        vi.mocked(stat).mockResolvedValue({ mtimeMs: 1700000000000 } as any);

        const result = await getDirectoryFingerprint('/some/dir');
        expect(result).toBe('dir-1700000000000');
    });

    it('returns empty string when stat fails', async () => {
        vi.mocked(stat).mockRejectedValue(new Error('ENOENT'));

        const result = await getDirectoryFingerprint('/missing');
        expect(result).toBe('');
    });
});
