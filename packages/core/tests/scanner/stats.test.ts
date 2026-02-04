import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
    groupFilesByExtension,
    calculateTotalSize,
    calculateStats,
    formatExtensionBreakdown,
    calculateSummary
} from '../../src/scanner/stats.js';

describe('groupFilesByExtension (Pure Function)', () => {
    describe('Example-based tests', () => {
        it('should group files by extension', () => {
            const files = [
                '/app/src/app.ts',
                '/app/src/utils.ts',
                '/app/lib/component.tsx',
                '/app/styles/main.css',
            ];

            const result = groupFilesByExtension(files);

            expect(result.get('.ts')).toBe(2);
            expect(result.get('.tsx')).toBe(1);
            expect(result.get('.css')).toBe(1);
        });

        it('should handle files without extensions', () => {
            const files = ['/app/README', '/app/LICENSE'];
            const result = groupFilesByExtension(files);

            expect(result.get('.no-extension')).toBe(2);
        });

        it('should handle mixed files with and without extensions', () => {
            const files = [
                '/app/src/app.ts',
                '/app/README',
                '/app/lib/utils.js',
                '/app/LICENSE',
            ];

            const result = groupFilesByExtension(files);

            expect(result.get('.ts')).toBe(1);
            expect(result.get('.js')).toBe(1);
            expect(result.get('.no-extension')).toBe(2);
        });

        it('should handle empty array', () => {
            const result = groupFilesByExtension([]);

            expect(result.size).toBe(0);
        });

        it('should handle single file', () => {
            const files = ['/app/test.ts'];
            const result = groupFilesByExtension(files);

            expect(result.get('.ts')).toBe(1);
            expect(result.size).toBe(1);
        });

        it('should handle files with same extension', () => {
            const files = [
                '/app/a.ts',
                '/app/b.ts',
                '/app/c.ts',
            ];

            const result = groupFilesByExtension(files);

            expect(result.get('.ts')).toBe(3);
            expect(result.size).toBe(1);
        });

        it('should handle multiple dot extensions', () => {
            const files = [
                '/app/component.spec.ts',
                '/app/utils.d.ts',
            ];

            const result = groupFilesByExtension(files);

            expect(result.get('.ts')).toBe(2);
        });

        it('should be case-sensitive', () => {
            const files = [
                '/app/file.ts',
                '/app/file.TS',
            ];

            const result = groupFilesByExtension(files);

            expect(result.get('.ts')).toBe(1);
            expect(result.get('.TS')).toBe(1);
        });
    });

    describe('Property-based tests', () => {
        it('should not mutate input array', () => {
            fc.assert(
                fc.property(
                    fc.array(fc.string()),
                    (files: readonly string[]) => {
                        const original = [...files];
                        groupFilesByExtension(files);
                        expect(files).toEqual(original);
                    }
                ),
                { numRuns: 1000 }
            );
        });

        it('should return new Map each time', () => {
            fc.assert(
                fc.property(
                    fc.array(fc.string()),
                    (files: readonly string[]) => {
                        const map1 = groupFilesByExtension(files);
                        const map2 = groupFilesByExtension(files);

                        expect(map1).not.toBe(map2); // Different instances
                        expect(map1).toEqual(map2); // Same content
                    }
                ),
                { numRuns: 500 }
            );
        });

        it('should have total count equal to input length', () => {
            fc.assert(
                fc.property(
                    fc.array(fc.string()),
                    (files: string[]) => {
                        const result = groupFilesByExtension(files);
                        const totalCount = Array.from(result.values()).reduce(
                            (sum, count) => sum + count,
                            0
                        );
                        expect(totalCount).toBe(files.length);
                    }
                ),
                { numRuns: 1000 }
            );
        });

        it('should always return a Map', () => {
            fc.assert(
                fc.property(
                    fc.array(fc.string()),
                    (files: readonly string[]) => {
                        const result = groupFilesByExtension(files);
                        expect(result instanceof Map).toBe(true);
                    }
                ),
                { numRuns: 1000 }
            );
        });

        it('should have all counts > 0', () => {
            fc.assert(
                fc.property(
                    fc.array(fc.string(), { minLength: 1 }),
                    (files: string[]) => {
                        const result = groupFilesByExtension(files);
                        const allPositive = Array.from(result.values()).every(
                            count => count > 0
                        );
                        expect(allPositive).toBe(true);
                    }
                ),
                { numRuns: 1000 }
            );
        });
    });

    describe('Immutability tests', () => {
        it('should not modify input array', () => {
            const files = ['/app/src/app.ts', '/app/lib/utils.ts'];
            const original = [...files];

            groupFilesByExtension(files);

            expect(files).toEqual(original);
        });
    });
});

describe('calculateTotalSize (Pure Function)', () => {
    describe('Example-based tests', () => {
        it('should return 0 (placeholder implementation)', () => {
            const files = ['/app/src/app.ts', '/app/lib/utils.ts'];
            const result = calculateTotalSize(files);

            expect(result).toBe(0);
        });

        it('should handle empty array', () => {
            const result = calculateTotalSize([]);
            expect(result).toBe(0);
        });
    });

    describe('Property-based tests', () => {
        it('should always return 0 (current implementation)', () => {
            fc.assert(
                fc.property(
                    fc.array(fc.string()),
                    (files: readonly string[]) => {
                        const result = calculateTotalSize(files);
                        expect(result).toBe(0);
                    }
                ),
                { numRuns: 500 }
            );
        });

        it('should not mutate input', () => {
            fc.assert(
                fc.property(
                    fc.array(fc.string()),
                    (files: readonly string[]) => {
                        const original = [...files];
                        calculateTotalSize(files);
                        expect(files).toEqual(original);
                    }
                ),
                { numRuns: 500 }
            );
        });
    });
});

describe('calculateStats (Pure Function)', () => {
    describe('Example-based tests', () => {
        it('should calculate basic statistics', () => {
            const files = [
                '/app/src/app.ts',
                '/app/src/utils.ts',
                '/app/lib/component.tsx',
            ];
            const startTime = performance.now() - 100;

            const stats = calculateStats(files, startTime, false);

            expect(stats.totalFiles).toBe(3);
            expect(stats.byExtension.get('.ts')).toBe(2);
            expect(stats.byExtension.get('.tsx')).toBe(1);
            expect(stats.totalSize).toBe(0); // Placeholder
            expect(stats.scanTime).toBeGreaterThanOrEqual(100);
            expect(stats.cacheHit).toBe(false);
        });

        it('should set cacheHit flag correctly', () => {
            const files = ['/app/src/app.ts'];
            const startTime = performance.now();

            const statsNoCacheHit = calculateStats(files, startTime, false);
            const statsCacheHit = calculateStats(files, startTime, true);

            expect(statsNoCacheHit.cacheHit).toBe(false);
            expect(statsCacheHit.cacheHit).toBe(true);
        });

        it('should handle empty file list', () => {
            const startTime = performance.now();
            const stats = calculateStats([], startTime, false);

            expect(stats.totalFiles).toBe(0);
            expect(stats.byExtension.size).toBe(0);
            expect(stats.scanTime).toBeGreaterThanOrEqual(0);
        });

        it('should calculate scan time accurately', () => {
            const files = ['/app/src/app.ts'];
            const startTime = performance.now() - 100;

            const stats = calculateStats(files, startTime, false);

            expect(stats.scanTime).toBeGreaterThanOrEqual(100);
        });
    });

    describe('Property-based tests', () => {
        it('should not mutate input array', () => {
            fc.assert(
                fc.property(
                    fc.array(fc.string()),
                    fc.float({ min: 0, max: 10000, noNaN: true, noDefaultInfinity: true }),
                    fc.boolean(),
                    (files: string[], timeOffset: number, cacheHit: boolean) => {
                        const original = [...files];
                        const startTime = performance.now() - timeOffset;

                        calculateStats(files, startTime, cacheHit);

                        expect(files).toEqual(original);
                    }
                ),
                { numRuns: 500 }
            );
        });

        it('should have totalFiles equal to input length', () => {
            fc.assert(
                fc.property(
                    fc.array(fc.string()),
                    (files: readonly string[]) => {
                        const startTime = performance.now();
                        const stats = calculateStats(files, startTime, false);

                        expect(stats.totalFiles).toBe(files.length);
                    }
                ),
                { numRuns: 1000 }
            );
        });

        it('should always have non-negative scanTime', () => {
            fc.assert(
                fc.property(
                    fc.array(fc.string()),
                    (files: readonly string[]) => {
                        const startTime = performance.now();
                        const stats = calculateStats(files, startTime, false);

                        expect(stats.scanTime).toBeGreaterThanOrEqual(0);
                    }
                ),
                { numRuns: 1000 }
            );
        });

        it('should return consistent results for same inputs', () => {
            fc.assert(
                fc.property(
                    fc.array(fc.string()),
                    fc.boolean(),
                    (files: string[], cacheHit: boolean) => {
                        const startTime = 1000;

                        const stats1 = calculateStats(files, startTime, cacheHit);
                        const stats2 = calculateStats(files, startTime, cacheHit);

                        expect(stats1.totalFiles).toBe(stats2.totalFiles);
                        expect(stats1.cacheHit).toBe(stats2.cacheHit);
                        expect(stats1.byExtension).toEqual(stats2.byExtension);
                    }
                ),
                { numRuns: 500 }
            );
        });
    });

    describe('Immutability tests', () => {
        it('should not mutate input files array', () => {
            const files = ['/app/src/app.ts', '/app/lib/utils.ts'];
            const original = [...files];
            const startTime = performance.now();

            calculateStats(files, startTime, false);

            expect(files).toEqual(original);
        });
    });
});

describe('formatExtensionBreakdown (Pure Function)', () => {
    describe('Example-based tests', () => {
        it('should format extension breakdown as string', () => {
            const byExtension = new Map<string, number>([
                ['.ts', 5],
                ['.tsx', 3],
                ['.js', 1],
            ]);

            const result = formatExtensionBreakdown(byExtension);

            expect(result).toContain('.ts: 5');
            expect(result).toContain('.tsx: 3');
            expect(result).toContain('.js: 1');
        });

        it('should sort by count descending', () => {
            const byExtension = new Map<string, number>([
                ['.js', 1],
                ['.ts', 5],
                ['.tsx', 3],
            ]);

            const result = formatExtensionBreakdown(byExtension);

            expect(result.indexOf('.ts')).toBeLessThan(result.indexOf('.tsx'));
            expect(result.indexOf('.tsx')).toBeLessThan(result.indexOf('.js'));
        });

        it('should handle empty map', () => {
            const byExtension = new Map<string, number>();

            const result = formatExtensionBreakdown(byExtension);

            expect(result).toBe('');
        });

        it('should handle single entry', () => {
            const byExtension = new Map<string, number>([['.ts', 10]]);

            const result = formatExtensionBreakdown(byExtension);

            expect(result).toBe('.ts: 10');
        });

        it('should join with commas', () => {
            const byExtension = new Map<string, number>([
                ['.ts', 5],
                ['.js', 3],
            ]);

            const result = formatExtensionBreakdown(byExtension);

            expect(result).toContain(', ');
        });
    });

    describe('Property-based tests', () => {
        it('should not mutate input map', () => {
            fc.assert(
                fc.property(
                    fc.array(fc.tuple(fc.string(), fc.integer({ min: 1 }))),
                    (entries: [string, number][]) => {
                        const byExtension = new Map(entries);
                        const original = new Map(byExtension);

                        formatExtensionBreakdown(byExtension);

                        expect(byExtension).toEqual(original);
                    }
                ),
                { numRuns: 500 }
            );
        });

        it('should always return a string', () => {
            fc.assert(
                fc.property(
                    fc.array(fc.tuple(fc.string(), fc.integer({ min: 1 }))),
                    (entries: [string, number][]) => {
                        const byExtension = new Map(entries);
                        const result = formatExtensionBreakdown(byExtension);

                        expect(typeof result).toBe('string');
                    }
                ),
                { numRuns: 1000 }
            );
        });
    });
});

describe('calculateSummary (Pure Function)', () => {
    describe('Example-based tests', () => {
        it('should calculate summary statistics', () => {
            const stats = {
                totalFiles: 10,
                byExtension: new Map<string, number>([
                    ['.ts', 7],
                    ['.tsx', 3],
                ]),
                totalSize: 0,
                scanTime: 100,
                cacheHit: false,
            };

            const summary = calculateSummary(stats);

            expect(summary.totalFiles).toBe(10);
            expect(summary.uniqueExtensions).toBe(2);
            expect(summary.avgTimePerFile).toBe(10); // 100ms / 10 files
            expect(summary.cacheHit).toBe(false);
        });

        it('should handle zero files without division error', () => {
            const stats = {
                totalFiles: 0,
                byExtension: new Map<string, number>(),
                totalSize: 0,
                scanTime: 50,
                cacheHit: false,
            };

            const summary = calculateSummary(stats);

            expect(summary.totalFiles).toBe(0);
            expect(summary.uniqueExtensions).toBe(0);
            expect(summary.avgTimePerFile).toBe(0);
        });

        it('should calculate unique extensions correctly', () => {
            const stats = {
                totalFiles: 5,
                byExtension: new Map<string, number>([
                    ['.ts', 3],
                    ['.tsx', 1],
                    ['.js', 1],
                ]),
                totalSize: 0,
                scanTime: 100,
                cacheHit: true,
            };

            const summary = calculateSummary(stats);

            expect(summary.uniqueExtensions).toBe(3);
        });

        it('should preserve cacheHit flag', () => {
            const statsWithCache = {
                totalFiles: 5,
                byExtension: new Map<string, number>([['.ts', 5]]),
                totalSize: 0,
                scanTime: 100,
                cacheHit: true,
            };

            const statsWithoutCache = { ...statsWithCache, cacheHit: false };

            expect(calculateSummary(statsWithCache).cacheHit).toBe(true);
            expect(calculateSummary(statsWithoutCache).cacheHit).toBe(false);
        });
    });

    describe('Property-based tests', () => {
        it('should preserve totalFiles', () => {
            fc.assert(
                fc.property(
                    fc.integer({ min: 0, max: 10000 }),
                    (totalFiles: number) => {
                        const stats = {
                            totalFiles,
                            byExtension: new Map<string, number>(),
                            totalSize: 0,
                            scanTime: 100,
                            cacheHit: false,
                        };

                        const summary = calculateSummary(stats);
                        expect(summary.totalFiles).toBe(totalFiles);
                    }
                ),
                { numRuns: 500 }
            );
        });

        it('should have avgTimePerFile >= 0', () => {
            fc.assert(
                fc.property(
                    fc.integer({ min: 0, max: 1000 }),
                    fc.float({ min: 0, max: 10000, noNaN: true, noDefaultInfinity: true }),
                    (totalFiles: number, scanTime: number) => {
                        const stats = {
                            totalFiles,
                            byExtension: new Map<string, number>(),
                            totalSize: 0,
                            scanTime,
                            cacheHit: false,
                        };

                        const summary = calculateSummary(stats);
                        expect(summary.avgTimePerFile).toBeGreaterThanOrEqual(0);
                    }
                ),
                { numRuns: 500 }
            );
        });
    });
});
