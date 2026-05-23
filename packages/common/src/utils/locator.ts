/**
 * @fileoverview
 * Offset-to-line/column locator built once per source file.
 *
 * Precomputes the byte offset of every line start during construction
 * (O(n) over file length) so subsequent `location(offset)` queries are
 * O(log lines) via binary search. Used by every rule that needs to
 * surface a finding's source position without re-scanning the file.
 *
 * Offsets are JavaScript UTF-16 code units, matching what Oxc, the
 * Angular HTML parser, and Babel's code-frame all emit. Surrogate pairs
 * count as two units; that's consistent with `String.prototype.length`.
 */

/**
 * Maps string offsets to 1-based line and column numbers.
 *
 * @example
 * ```ts
 * const locator = new Locator("a\nb");
 * locator.location(2); // { line: 2, column: 1 }
 * ```
 */
export class Locator {
    /** Byte offset of each line's first character. `lines[0]` is always `0`. */
    private readonly lines: number[];
    /** Length of the source used for `clampOffset` bounds checking. */
    private readonly contentLength: number;

    /**
     * Builds the line-start index for a source file.
     *
     * @param content - Full source text whose offsets will be queried.
     */
    constructor(content: string) {
        this.contentLength = content.length;
        this.lines = [0];
        for (let i = 0; i < content.length; i++) {
            if (content[i] === '\n') this.lines.push(i + 1);
        }
    }

    /**
     * Resolves a zero-based string offset to a 1-based source location.
     *
     * Offsets outside the source range are clamped (`< 0` → `0`,
     * `> length` → `length`) so reporters never produce negative
     * coordinates when a parser hands back a sentinel.
     *
     * @param offset - Zero-based UTF-16 string offset into the original content.
     * @returns The corresponding 1-based `{ line, column }` pair.
     */
    public location(offset: number): { line: number; column: number } {
        const clamped = this.clampOffset(offset);

        let low = 0;
        let high = this.lines.length - 1;
        // `>>>` is an unsigned right shift; safe here because both bounds
        // are small non-negative integers (bounded by the number of lines
        // in the source).
        while (low <= high) {
            const mid = (low + high) >>> 1;
            if (this.lines[mid] <= clamped) low = mid + 1;
            else high = mid - 1;
        }

        const line = low - 1;
        const lineStart = this.lines[line];
        return {
            line: line + 1,
            column: clamped - lineStart + 1,
        };
    }

    /** Clamps `offset` to the valid `[0, contentLength]` window. */
    private clampOffset(offset: number): number {
        if (!Number.isFinite(offset) || offset < 0) return 0;
        if (offset > this.contentLength) return this.contentLength;
        return offset;
    }
}
