
import { createPosition, createRange, rangesOverlap, normalizePath, isDefined } from '../src/utils.js';

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
        it('should detect overlapping ranges', () => {
            const range1 = createRange(1, 0, 3, 0);
            const range2 = createRange(2, 0, 4, 0);
            expect(rangesOverlap(range1, range2)).toBe(true);
        });

        it('should detect non-overlapping ranges', () => {
            const range1 = createRange(1, 0, 2, 0);
            const range2 = createRange(3, 0, 4, 0);
            expect(rangesOverlap(range1, range2)).toBe(false);
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
});