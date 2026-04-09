import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    loadGitignore,
    createGitignoreFilter,
    createPassThroughFilter,
    loadAndCreateGitignoreFilter
} from '../src/gitignore.js';

// Use vi.hoisted so the mock reference is stable under SWC + Vitest.
const mockReadFile = vi.hoisted(() => vi.fn());
vi.mock('node:fs/promises', () => ({ readFile: mockReadFile }));

describe('loadGitignore', () => {
    beforeEach(() => { vi.clearAllMocks(); });

    it('returns null when file does not exist', async () => {
        mockReadFile.mockRejectedValue(new Error('ENOENT'));
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

    it('creates pass-through filter if gitignore missing', async () => {
        mockReadFile.mockRejectedValue(new Error('ENOENT'));

        const result = await loadAndCreateGitignoreFilter('/root');

        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.data('/root/node_modules/pkg.js', '/root')).toBe(true);
        }
    });
});
