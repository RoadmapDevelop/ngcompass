import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFile } from 'node:fs/promises';
import {
    loadGitignore,
    createGitignoreFilter,
    createPassThroughFilter,
    loadAndCreateGitignoreFilter
} from '../src/gitignore.js';

vi.mock('node:fs/promises', () => ({
    readFile: vi.fn()
}));

describe('loadGitignore', () => {
    beforeEach(() => { vi.clearAllMocks(); });

    it('returns content when file exists', async () => {
        vi.mocked(readFile).mockResolvedValue('node_modules\n.env\n');
        const content = await loadGitignore('/root');
        expect(content).toBe('node_modules\n.env\n');
    });

    it('returns null when file does not exist', async () => {
        vi.mocked(readFile).mockRejectedValue(new Error('ENOENT'));
        const content = await loadGitignore('/root');
        expect(content).toBeNull();
    });
});

describe('createGitignoreFilter', () => {
    it('filters out ignored files', () => {
        const filter = createGitignoreFilter('node_modules/\n.env\n');

        expect(filter('/root/src/app.ts', '/root')).toBe(true);
        expect(filter('/root/node_modules/lib.js', '/root')).toBe(false);
        expect(filter('/root/.env', '/root')).toBe(false);
    });
});

describe('createPassThroughFilter', () => {
    it('always returns true', () => {
        const filter = createPassThroughFilter();
        expect(filter('anything', 'anywhere')).toBe(true);
    });
});

describe('loadAndCreateGitignoreFilter', () => {
    beforeEach(() => { vi.clearAllMocks(); });

    it('creates active filter if gitignore exists', async () => {
        vi.mocked(readFile).mockResolvedValue('node_modules\n');

        const result = await loadAndCreateGitignoreFilter('/root');

        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.data('/root/src/index.ts', '/root')).toBe(true);
            expect(result.data('/root/node_modules/pkg.js', '/root')).toBe(false);
        }
    });

    it('creates pass-through filter if gitignore missing', async () => {
        vi.mocked(readFile).mockRejectedValue(new Error('ENOENT'));

        const result = await loadAndCreateGitignoreFilter('/root');

        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.data('/root/node_modules/pkg.js', '/root')).toBe(true);
        }
    });
});
