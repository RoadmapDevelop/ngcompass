import {
    createPosition,
    createRange,
    rangesOverlap,
    normalizePath,
    isDefined,
    isNonEmpty,
    groupBy,
    sortBy,
    mapResult,
    flatMapResult,
    collectResults
} from '../src/utils.js';
import type { Result } from '../src/types.js';

describe('utils', () => {
    describe('createPosition', () => {
        it('should create a position object', () => {
            const pos = createPosition(1, 5);
            expect(pos).toEqual({ line: 1, column: 5 });
        });
    });

    describe('createRange', () => {
        it('should create a range object', () => {
            const range = createRange(1, 0, 3, 10);
            expect(range).toEqual({
                start: { line: 1, column: 0 },
                end: { line: 3, column: 10 },
            });
        });
    });

    describe('rangesOverlap', () => {
        it('should detect overlapping ranges (lines overlap)', () => {
            const range1 = createRange(1, 0, 3, 0);
            const range2 = createRange(2, 0, 4, 0);
            expect(rangesOverlap(range1, range2)).toBe(true);
        });

        it('should detect completely clear non-overlapping ranges (via lines)', () => {
            const range1 = createRange(1, 0, 2, 0);
            const range2 = createRange(3, 0, 4, 0);
            expect(rangesOverlap(range1, range2)).toBe(false);
        });

        it('should detect when b finishes before a starts completely', () => {
            const range1 = createRange(5, 0, 6, 0);
            const range2 = createRange(3, 0, 4, 0);
            expect(rangesOverlap(range1, range2)).toBe(false);
        });

        it('should reject overlap if a ends on same line b starts but completely before column', () => {
            const a = createRange(1, 0, 2, 5);
            const b = createRange(2, 5, 3, 0);
            // End is exclusive: a.end.column == b.start.column means NO overlap
            expect(rangesOverlap(a, b)).toBe(false);

            const a2 = createRange(1, 0, 2, 4);
            const b2 = createRange(2, 5, 3, 0);
            expect(rangesOverlap(a2, b2)).toBe(false);
        });

        it('should detect overlap if a ends on same line b starts but after column', () => {
            const a = createRange(1, 0, 2, 10);
            const b = createRange(2, 5, 3, 0);
            expect(rangesOverlap(a, b)).toBe(true);
        });

        it('should reject overlap if b ends on same line a starts but completely before column', () => {
            const a = createRange(2, 5, 3, 0);
            const b = createRange(1, 0, 2, 5);
            expect(rangesOverlap(a, b)).toBe(false);

            const a2 = createRange(2, 6, 3, 0);
            const b2 = createRange(1, 0, 2, 5);
            expect(rangesOverlap(a2, b2)).toBe(false);
        });

        it('should detect overlap if b ends on same line a starts but after column', () => {
            const a = createRange(2, 5, 3, 0);
            const b = createRange(1, 0, 2, 10);
            expect(rangesOverlap(a, b)).toBe(true);
        });
    });

    describe('normalizePath', () => {
        it('should normalize backslashes to forward slashes', () => {
            expect(normalizePath('src\\app\\component.ts')).toBe(
                'src/app/component.ts'
            );
        });

        it('should remove trailing slashes', () => {
            expect(normalizePath('src/app/')).toBe('src/app');
            expect(normalizePath('src/app//')).toBe('src/app');
            expect(normalizePath('src\\app\\\\')).toBe('src/app');
        });
    });

    describe('isDefined', () => {
        it('should return true for defined values', () => {
            expect(isDefined(0)).toBe(true);
            expect(isDefined('')).toBe(true);
            expect(isDefined(false)).toBe(true);
        });

        it('should return false for null or undefined', () => {
            expect(isDefined(null)).toBe(false);
            expect(isDefined(undefined)).toBe(false);
        });
    });

    describe('isNonEmpty', () => {
        it('should return false for empty array', () => {
            expect(isNonEmpty([])).toBe(false);
        });

        it('should return true for non-empty array', () => {
            expect(isNonEmpty([1])).toBe(true);
            expect(isNonEmpty([1, 2, 3])).toBe(true);
        });
    });

    describe('groupBy', () => {
        it('should group items by string key', () => {
            const items = [
                { type: 'fruit', name: 'apple' },
                { type: 'veg', name: 'carrot' },
                { type: 'fruit', name: 'banana' }
            ];

            const grouped = groupBy(items, i => i.type);
            expect(grouped.size).toBe(2);
            expect(grouped.get('fruit')).toEqual([items[0], items[2]]);
            expect(grouped.get('veg')).toEqual([items[1]]);
            expect(grouped.get('meat')).toBeUndefined();
        });

        it('should handle empty array', () => {
            const grouped = groupBy([], (x: any) => x.id);
            expect(grouped.size).toBe(0);
        });
    });

    describe('sortBy', () => {
        it('should sort objects numbers ascendingly', () => {
            const items = [{ id: 3 }, { id: 1 }, { id: 2 }];
            const sorted = sortBy(items, i => i.id);
            expect(sorted).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
            // verify original array wasn't mutated
            expect(items[0]).toEqual({ id: 3 });
        });

        it('should sort strings alphabetically', () => {
            const items = ['c', 'a', 'b'];
            const sorted = sortBy(items, x => x);
            expect(sorted).toEqual(['a', 'b', 'c']);
        });

        it('should maintain order when elements have equal keys', () => {
            const items = [{ id: 1, val: 'a' }, { id: 1, val: 'b' }];
            const sorted = sortBy(items, i => i.id);
            expect(sorted).toEqual([{ id: 1, val: 'a' }, { id: 1, val: 'b' }]);
        });
    });

    describe('mapResult', () => {
        it('should transform data on an Ok result', () => {
            const result: Result<number, string> = { ok: true, data: 5 };
            const mapped = mapResult(result, x => x * 2);
            expect(mapped).toEqual({ ok: true, data: 10 });
        });

    });

    describe('flatMapResult', () => {
        it('should continue computation returning a new Result on Ok', () => {
            const result: Result<number, string> = { ok: true, data: 5 };
            const continued = flatMapResult(result, val => {
                return { ok: true, data: val.toString() };
            });
            expect(continued).toEqual({ ok: true, data: '5' });
        });

    });

    describe('collectResults', () => {
        it('should return Ok array of data when all succeed', () => {
            const results: Result<number, string>[] = [
                { ok: true, data: 1 },
                { ok: true, data: 2 },
                { ok: true, data: 3 }
            ];
            expect(collectResults(results)).toEqual({ ok: true, data: [1, 2, 3] });
        });

        it('should return empty Ok array when given empty list', () => {
            const results: Result<number, string>[] = [];
            expect(collectResults(results)).toEqual({ ok: true, data: [] });
        });

        it('should return the first Err when any fails', () => {
            const results: Result<number, string>[] = [
                { ok: true, data: 1 },
                { ok: false, error: 'first failure' },
                { ok: false, error: 'second failure' }
            ];
            expect(collectResults(results)).toEqual({ ok: false, error: 'first failure' });
        });
    });
});