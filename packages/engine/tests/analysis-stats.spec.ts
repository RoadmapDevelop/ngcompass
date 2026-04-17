/**
 * Unit Tests — analysis-stats.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { calculateStats } from '../src/analysis-stats.js';
import type { RuleResult } from '@ngcompass/common';

function makeResult(ruleName: string, failures: Array<{ filePath: string; severity: string }>): RuleResult {
    return {
        ruleName,
        failures: failures.map((f) => ({
            filePath: f.filePath,
            message: 'test failure',
            line: 1,
            column: 1,
            severity: f.severity as any,
            ruleName,
        })),
    };
}

describe('calculateStats', () => {
    beforeEach(() => {
        let tick = 0;
        vi.spyOn(performance, 'now').mockImplementation(() => (tick += 10));
    });

    it('returns zero counts for empty results', () => {
        const stats = calculateStats([], performance.now());
        expect(stats.totalFiles).toBe(0);
        expect(stats.totalErrors).toBe(0);
        expect(stats.totalWarnings).toBe(0);
    });

    it('counts errors correctly', () => {
        const results = [
            makeResult('rule-a', [
                { filePath: '/src/a.ts', severity: 'error' },
                { filePath: '/src/a.ts', severity: 'error' },
            ]),
        ];
        const stats = calculateStats(results, performance.now());
        expect(stats.totalErrors).toBe(2);
        expect(stats.totalWarnings).toBe(0);
    });

    it('counts warnings correctly', () => {
        const results = [
            makeResult('rule-b', [{ filePath: '/src/b.ts', severity: 'warn' }]),
        ];
        const stats = calculateStats(results, performance.now());
        expect(stats.totalWarnings).toBe(1);
        expect(stats.totalErrors).toBe(0);
    });

    it('counts mixed severities from multiple rules', () => {
        const results = [
            makeResult('rule-a', [
                { filePath: '/src/a.ts', severity: 'error' },
                { filePath: '/src/b.ts', severity: 'warn' },
            ]),
            makeResult('rule-b', [{ filePath: '/src/c.ts', severity: 'warn' }]),
        ];
        const stats = calculateStats(results, performance.now());
        expect(stats.totalErrors).toBe(1);
        expect(stats.totalWarnings).toBe(2);
    });

    it('deduplicates file paths for totalFiles', () => {
        const results = [
            makeResult('rule-a', [
                { filePath: '/src/shared.ts', severity: 'error' },
                { filePath: '/src/shared.ts', severity: 'warn' },
                { filePath: '/src/other.ts', severity: 'error' },
            ]),
        ];
        const stats = calculateStats(results, performance.now());
        expect(stats.totalFiles).toBe(2);
    });

    it('includes cacheHitRate when provided', () => {
        const stats = calculateStats([], performance.now(), 0.75);
        expect(stats.cacheHitRate).toBe(0.75);
    });

    it('leaves cacheHitRate undefined when not provided', () => {
        const stats = calculateStats([], performance.now());
        expect(stats.cacheHitRate).toBeUndefined();
    });

    it('produces a non-negative duration', () => {
        const start = performance.now();
        const stats = calculateStats([], start);
        expect(stats.duration).toBeGreaterThanOrEqual(0);
    });

    it('treats "off" severity failures as neither error nor warning', () => {
        const results = [
            makeResult('rule-off', [{ filePath: '/src/x.ts', severity: 'off' }]),
        ];
        const stats = calculateStats(results, performance.now());
        expect(stats.totalErrors).toBe(0);
        expect(stats.totalWarnings).toBe(0);
        expect(stats.totalFiles).toBe(1);
    });
});
