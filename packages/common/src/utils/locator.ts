export class Locator {
  private readonly lines: number[];

  private readonly contentLength: number;

  constructor(content: string) {
    this.contentLength = content.length;
    this.lines = [0];
    for (let i = 0; i < content.length; i++) {
      if (content[i] === '\n') this.lines.push(i + 1);
    }
  }

  public location(offset: number): { line: number; column: number } {
    const clamped = this.clampOffset(offset);

    let low = 0;
    let high = this.lines.length - 1;

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

  private clampOffset(offset: number): number {
    if (!Number.isFinite(offset) || offset < 0) return 0;
    if (offset > this.contentLength) return this.contentLength;
    return offset;
  }
}
