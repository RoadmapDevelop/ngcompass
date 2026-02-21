/**
 * Shared utility functions for use across all @ngcompass packages.
 *
 * All functions here are pure: no side effects, deterministic output,
 * explicit dependencies. Per the FP coding guide — composable, testable,
 * zero global state.
 */

// ---------------------------------------------------------------------------
// Position & Range
// ---------------------------------------------------------------------------

/**
 * A 1-based source location (line, column).
 */
export interface Position {
    readonly line: number;
    readonly column: number;
}

/**
 * A span between two source positions.
 */
export interface Range {
    readonly start: Position;
    readonly end: Position;
}

/**
 * Creates an immutable Position value.
 */
export function createPosition(line: number, column: number): Position {
    return { line, column };
}

/**
 * Creates an immutable Range value from four coordinates.
 */
export function createRange(
    startLine: number,
    startColumn: number,
    endLine: number,
    endColumn: number,
): Range {
    return {
        start: createPosition(startLine, startColumn),
        end: createPosition(endLine, endColumn),
    };
}

/**
 * Returns true when two ranges share at least one point.
 * Ranges are inclusive on start and exclusive on end (half-open interval).
 */
export function rangesOverlap(a: Range, b: Range): boolean {
    const aEndLine = a.end.line;
    const bEndLine = b.end.line;
    const aStartLine = a.start.line;
    const bStartLine = b.start.line;

    if (aEndLine < bStartLine || bEndLine < aStartLine) return false;
    if (aEndLine === bStartLine && a.end.column <= b.start.column) return false;
    if (bEndLine === aStartLine && b.end.column <= a.start.column) return false;

    return true;
}

// ---------------------------------------------------------------------------
// Path utilities
// ---------------------------------------------------------------------------

/**
 * Normalises a file path to forward slashes and strips trailing slashes.
 * Pure: no fs access, no side effects.
 */
export function normalizePath(filePath: string): string {
    return filePath.replace(/\\/g, '/').replace(/\/+$/, '');
}

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

/**
 * Returns true for any value that is neither null nor undefined.
 * Useful as a filter predicate: `items.filter(isDefined)`
 */
export function isDefined<T>(value: T | null | undefined): value is T {
    return value !== null && value !== undefined;
}

/**
 * Returns true when an array has at least one element.
 * Narrows the type to a non-empty tuple so callers can safely access [0].
 */
export function isNonEmpty<T>(arr: readonly T[]): arr is readonly [T, ...T[]] {
    return arr.length > 0;
}

// ---------------------------------------------------------------------------
// Functional array helpers
// ---------------------------------------------------------------------------

/**
 * Groups an array of items by a key derived from each item.
 * Returns an immutable Map preserving insertion order within each group.
 *
 * @example
 * groupBy([{severity:'error',...}, {severity:'warning',...}], x => x.severity)
 * // Map { 'error' => [...], 'warning' => [...] }
 */
export function groupBy<T, K>(items: readonly T[], keyFn: (item: T) => K): Map<K, T[]> {
    const map = new Map<K, T[]>();
    for (const item of items) {
        const key = keyFn(item);
        const bucket = map.get(key);
        if (bucket) {
            bucket.push(item);
        } else {
            map.set(key, [item]);
        }
    }
    return map;
}

/**
 * Returns a new array sorted by a numeric or string key.
 * Does not mutate the input array.
 *
 * @example
 * sortBy(failures, f => f.line)
 */
export function sortBy<T>(items: readonly T[], keyFn: (item: T) => number | string): T[] {
    return [...items].sort((a, b) => {
        const ka = keyFn(a);
        const kb = keyFn(b);
        if (ka < kb) return -1;
        if (ka > kb) return 1;
        return 0;
    });
}

// ---------------------------------------------------------------------------
// Result combinators (for the Result<T,E> type defined in types.ts)
// ---------------------------------------------------------------------------

import type { Result } from './types.js';

/**
 * Transforms the success value of a Result without unwrapping it.
 * Returns the original error untouched on failure.
 *
 * @example
 * mapResult(Ok(42), n => n * 2)  // Ok(84)
 * mapResult(Err('bad'), n => n * 2)  // Err('bad')
 */
export function mapResult<T, U, E>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> {
    if (result.ok) {
        return { ok: true, data: fn(result.data) };
    }
    return result;
}

/**
 * Chains Result-returning operations (flatMap / bind).
 * Short-circuits on the first failure.
 *
 * @example
 * flatMapResult(Ok('path'), path => readFile(path))
 */
export function flatMapResult<T, U, E>(
    result: Result<T, E>,
    fn: (value: T) => Result<U, E>,
): Result<U, E> {
    if (result.ok) {
        return fn(result.data);
    }
    return result;
}

/**
 * Collects an array of Results into a single Result.
 * Returns Ok with all values if every Result is Ok.
 * Returns the first Err encountered if any Result fails.
 *
 * @example
 * collectResults([Ok(1), Ok(2), Ok(3)])  // Ok([1, 2, 3])
 * collectResults([Ok(1), Err('oops')])   // Err('oops')
 */
export function collectResults<T, E>(results: readonly Result<T, E>[]): Result<T[], E> {
    const data: T[] = [];
    for (const result of results) {
        if (!result.ok) return result;
        data.push(result.data);
    }
    return { ok: true, data };
}
