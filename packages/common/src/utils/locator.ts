/**
 * @fileoverview
 * Offset-to-line/column locator built once per source file.
 *
 * Precomputes the byte offset of every line start during construction
 * (O(n) over file length) so subsequent `location(offset)` queries are
 * O(log lines) via binary search. Used by every rule that needs to
 * surface a finding's source position without re-scanning the file.
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
    private readonly lines: number[];

    /**
     * Builds the line-start index for a source file.
     *
     * @param content - Full source text whose offsets will be queried.
     */
    constructor(content: string) {
        this.lines = [0];
        for (let i = 0; i < content.length; i++) {
            if (content[i] === '\n') {
                this.lines.push(i + 1);
            }
        }
    }

    /**
     * Resolves a zero-based string offset to a 1-based source location.
     *
     * @param offset - Zero-based UTF-16 string offset into the original content.
     * @returns The corresponding 1-based line and column pair.
     */
    public location(offset: number): { line: number; column: number } {
        let low = 0;
        let high = this.lines.length - 1;

        while (low <= high) {
            const mid = (low + high) >>> 1;
            if (this.lines[mid] <= offset) {
                low = mid + 1;
            } else {
                high = mid - 1;
            }
        }

        const line = low - 1;
        const lineStart = this.lines[line];

        return {
            line: line + 1, // 1-indexed
            column: offset - lineStart + 1 // 1-indexed
        };
    }
}
