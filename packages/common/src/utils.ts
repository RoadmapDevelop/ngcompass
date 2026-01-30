/**
 * Common utility functions
 */

import type { Position, Range } from './types';

/**
 * Create a Position object
 */
export function createPosition(line: number, column: number): Position {
    return { line, column };
}

/**
 * Create a Range object
 */
export function createRange(
    startLine: number,
    startColumn: number,
    endLine: number,
    endColumn: number
): Range {
    return {
        start: createPosition(startLine, startColumn),
        end: createPosition(endLine, endColumn),
    };
}

/**
 * Check if two ranges overlap
 */
export function rangesOverlap(range1: Range, range2: Range): boolean {
    return !(
        range1.end.line < range2.start.line ||
        (range1.end.line === range2.start.line &&
            range1.end.column <= range2.start.column) ||
        range2.end.line < range1.start.line ||
        (range2.end.line === range1.start.line &&
            range2.end.column <= range1.start.column)
    );
}

/**
 * Normalize file path (forward slashes, no trailing slash)
 */
export function normalizePath(filePath: string): string {
    return filePath.replace(/\\/g, '/').replace(/\/$/, '');
}

/**
 * Check if value is defined (not null or undefined)
 */
export function isDefined<T>(value: T | null | undefined): value is T {
    return value !== null && value !== undefined;
}