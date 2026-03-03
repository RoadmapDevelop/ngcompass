import { describe, it, expect, vi, beforeEach } from 'vitest';
import { stat } from 'node:fs/promises';
import {
    groupFilesByExtension,
    calculateTotalSize,
    calculateStats,
    formatExtensionBreakdown,
    calculateSummary
} from '../src/stats.js';

vi.mock('node:fs/promises', () => ({
    stat: vi.fn()
}));

describe('groupFilesByExtension', () => {
    it('groups files correctly by extension', () => {
        const files = ['a.ts', 'b.html', 'dir/c.ts', 'd', 'e.test.ts'];
        const result = groupFilesByExtension(files);

        expect(result.get('.ts')).toBe(3);
        expect(result.get('.html')).toBe(1);
        expect(result.get('.no-extension')).toBe(1);
    });

    it('returns empty map for empty array', () => {
        const result = groupFilesByExtension([]);
        expect(result.size).toBe(0);
    });
});

describe('calculateTotalSize', () => {
    beforeEach(() => { vi.clearAllMocks(); });

    it('sums file sizes from fs.stat', async () => {
        vi.mocked(stat)
            .mockResolvedValueOnce({ size: 1024 } as any)
            .mockResolvedValueOnce({ size: 512 } as any);

        const result = await calculateTotalSize(['a.ts', 'b.html']);
        expect(result).toBe(1536);
    });

    it('returns 0 for empty file list', async () => {
        const result = await calculateTotalSize([]);
        expect(result).toBe(0);
        expect(stat).not.toHaveBeenCalled();
    });

    it('skips unreadable files and sums the rest', async () => {
        vi.mocked(stat)
            .mockResolvedValueOnce({ size: 200 } as any)
            .mockRejectedValueOnce(new Error('EACCES: permission denied'));

        const result = await calculateTotalSize(['readable.ts', 'locked.ts']);
        expect(result).toBe(200);
    });
});

describe('calculateStats', () => {
    beforeEach(() => { vi.clearAllMocks(); });

    it('computes correct statistics with real file sizes', async () => {
        vi.mocked(stat)
            .mockResolvedValueOnce({ size: 100 } as any)
            .mockResolvedValueOnce({ size: 200 } as any)
            .mockResolvedValueOnce({ size: 300 } as any);

        const files = ['a.ts', 'b.ts', 'c.html'];
        const startTime = performance.now() - 100;

        const result = await calculateStats(files, startTime, true);

        expect(result.totalFiles).toBe(3);
        expect(result.byExtension.get('.ts')).toBe(2);
        expect(result.byExtension.get('.html')).toBe(1);
        expect(result.totalSize).toBe(600);
        expect(result.scanTime).toBeGreaterThanOrEqual(100);
        expect(result.cacheHit).toBe(true);
    });
});

describe('formatExtensionBreakdown', () => {
    it('formats map into descending count string', () => {
        const map = new Map<string, number>([
            ['.html', 1],
            ['.ts', 5],
            ['.css', 2]
        ]);

        const formatted = formatExtensionBreakdown(map);
        expect(formatted).toBe('.ts: 5, .css: 2, .html: 1');
    });

    it('handles empty map', () => {
        expect(formatExtensionBreakdown(new Map())).toBe('');
    });
});

describe('calculateSummary', () => {
    it('derives summary from statistics', () => {
        const stats = {
            totalFiles: 4,
            byExtension: new Map([['.ts', 2], ['.html', 2]]),
            totalSize: 0,
            scanTime: 200,
            cacheHit: false
        };

        const summary = calculateSummary(stats);

        expect(summary.totalFiles).toBe(4);
        expect(summary.uniqueExtensions).toBe(2);
        expect(summary.avgTimePerFile).toBe(50);
        expect(summary.cacheHit).toBe(false);
    });

    it('handles zero files avoiding division by zero', () => {
        const stats = {
            totalFiles: 0,
            byExtension: new Map(),
            totalSize: 0,
            scanTime: 50,
            cacheHit: true
        };

        const summary = calculateSummary(stats);
        expect(summary.avgTimePerFile).toBe(0);
    });
});
