
/**
 * Helper to map string offsets to line/column numbers.
 */
export class Locator {
    private readonly lines: number[];

    constructor(private readonly content: string) {
        this.lines = [0];
        for (let i = 0; i < content.length; i++) {
            if (content[i] === '\n') {
                this.lines.push(i + 1);
            }
        }
    }

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
