import { describe, it, expect, vi, beforeEach } from 'vitest';
import { glob } from 'tinyglobby';
import { executeGlob, patternsLikelyHaveMatches } from '../src/glob.js';
import type { ExpandedPatterns } from '../src/types.js';

vi.mock('tinyglobby', () => ({
    glob: vi.fn()
}));

describe('executeGlob', () => {
    beforeEach(() => { vi.clearAllMocks(); });

    it('returns successfully from tinyglobby', async () => {
        vi.mocked(glob).mockResolvedValue(['/root/a.ts', '/root/b.html']);

        const patterns: ExpandedPatterns = {
            include: ['**/*.ts', '**/*.html'],
            ignore: ['node_modules/**']
        };

        const result = await executeGlob(patterns, '/root', { followSymlinks: false });

        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.data.files).toEqual(['/root/a.ts', '/root/b.html']);
        }

        expect(glob).toHaveBeenCalledWith(
            ['**/*.ts', '**/*.html'],
            expect.objectContaining({
                cwd: '/root',
                ignore: ['node_modules/**'],
                absolute: true,
                followSymbolicLinks: false,
                onlyFiles: true,
                dot: false
            })
        );
    });

    it('returns error result when glob fails', async () => {
        vi.mocked(glob).mockRejectedValue(new Error('Glob error'));

        const patterns: ExpandedPatterns = {
            include: ['**/*.ts'],
            ignore: []
        };

        const result = await executeGlob(patterns, '/root', { followSymlinks: false });

        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.error.message).toContain('Glob execution failed: Glob error');
        }
    });
});

describe('patternsLikelyHaveMatches', () => {
    it('returns false when include is empty', () => {
        expect(patternsLikelyHaveMatches({ include: [], ignore: [] })).toBe(false);
    });

    it('returns false when include has only exclusions', () => {
        expect(patternsLikelyHaveMatches({ include: ['!node_modules'], ignore: [] })).toBe(false);
    });

    it('returns true when there are valid inclusinos', () => {
        expect(patternsLikelyHaveMatches({ include: ['**/*.ts'], ignore: [] })).toBe(true);
        expect(patternsLikelyHaveMatches({ include: ['src/**', '!test/**'], ignore: [] })).toBe(true);
    });
});
