import { describe, it, expect } from 'vitest';
import {
    groupFilesByExtension,
    calculateTotalSize,
    calculateStats,
    formatExtensionBreakdown,
    calculateSummary
} from '../src/stats.js';

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
    it('returns 0', () => {
        expect(calculateTotalSize(['a.ts', 'b.html'])).toBe(0);
    });
});

describe('calculateStats', () => {
    it('computes correct statistics', () => {
        const files = ['a.ts', 'b.ts', 'c.html'];
        const startTime = performance.now() - 100;

        const result = calculateStats(files, startTime, true);

        expect(result.totalFiles).toBe(3);
        expect(result.byExtension.get('.ts')).toBe(2);
        expect(result.byExtension.get('.html')).toBe(1);
        expect(result.totalSize).toBe(0);
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
