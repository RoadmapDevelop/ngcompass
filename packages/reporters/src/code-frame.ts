import fs from 'node:fs';
import pc from 'picocolors';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Lines of source context shown above and below the violation line. */
const CONTEXT_LINES = 2;

/** Fallback caret width when no identifier or non-whitespace token is found at the target column. */
const FALLBACK_CARET_WIDTH = 8;

/**
 * Width of the active-line arrow prefix: `"> "` (2 chars).
 * Combined with the dynamic gutter width and GUTTER_PIPE_WIDTH gives the total
 * left-hand offset used to align the caret row beneath the source-start column.
 */
const GUTTER_ARROW_WIDTH = 2;

/**
 * Width of the gutter pipe separator: `" │ "` (3 chars).
 * See GUTTER_ARROW_WIDTH for context.
 */
const GUTTER_PIPE_WIDTH = 3;

// ---------------------------------------------------------------------------
// Source reader abstraction
// ---------------------------------------------------------------------------

/**
 * Abstraction over file-system source reading.
 *
 * Providing this interface allows callers (reporters) to inject a test double
 * without touching the module-level cache, keeping each test hermetic and
 * avoiding real filesystem access during unit tests.
 */
export interface SourceReader {
    readLines(filePath: string): string[];
}

// ---------------------------------------------------------------------------
// File-level source cache
// ---------------------------------------------------------------------------

/**
 * Process-lifetime cache of source lines, keyed by absolute file path.
 *
 * Eviction strategy: NEVER within a single process run.
 * Rationale: a source file is read at most once per analysis run; reporters
 * only access files that were already parsed, so staleness within the same
 * invocation is not a concern.
 *
 * Test implication: always call `clearSourceCache()` in `beforeEach` when
 * tests involve real file paths, to prevent cross-test pollution.
 */
const sourceCache = new Map<string, string[]>();

/**
 * Reads a source file and splits it into lines.
 *
 * Returns an empty array when the file cannot be read (permissions, not found, etc.).
 * Results are cached for the lifetime of the process (see `sourceCache`).
 *
 * @param filePath - Absolute path to the source file.
 * @returns The file split into lines, or an empty array on read failure.
 */
export function readSourceLines(filePath: string): string[] {
    const cached = sourceCache.get(filePath);
    if (cached !== undefined) return cached;

    try {
        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.split('\n');
        sourceCache.set(filePath, lines);
        return lines;
    } catch {
        // Cache the empty result to avoid repeated failed reads for the same path.
        sourceCache.set(filePath, []);
        return [];
    }
}

/** Clears the in-memory source cache. Call in `beforeEach` for hermetic tests. */
export function clearSourceCache(): void {
    sourceCache.clear();
}

/**
 * Default SourceReader backed by the process-lifetime filesystem cache.
 * Inject a different implementation in tests to avoid real filesystem access.
 */
export const defaultSourceReader: SourceReader = {
    readLines: readSourceLines,
};

// ---------------------------------------------------------------------------
// Token-length inference
// ---------------------------------------------------------------------------

/**
 * Estimates how many characters the token at `col` (1-indexed) spans on `line`.
 *
 * Matching priority:
 * 1. Identifier characters (`[A-Za-z0-9_$]+`).
 * 2. Any non-whitespace run.
 * 3. Fallback fixed width.
 *
 * @param line - The source line string.
 * @param col  - 1-indexed column of the token start.
 * @returns Estimated token character width.
 */
function inferTokenLength(line: string, col: number): number {
    const startIndex = Math.max(0, col - 1);
    const rest = line.slice(startIndex);

    const identMatch = rest.match(/^[A-Za-z0-9_$]+/);
    if (identMatch) return identMatch[0].length;

    const nonSpaceMatch = rest.match(/^\S+/);
    if (nonSpaceMatch) return nonSpaceMatch[0].length;

    return FALLBACK_CARET_WIDTH;
}

// ---------------------------------------------------------------------------
// Frame renderer — pure helpers
// ---------------------------------------------------------------------------

/** Renders a single dim context (non-active) source line. */
function renderContextLine(lineNumber: number, source: string, gutterWidth: number): string {
    const label = String(lineNumber).padStart(gutterWidth);
    return `  ${pc.dim(label)} ${pc.dim('│')} ${pc.dim(source)}`;
}

/**
 * Renders the active (violation) source line and the caret row beneath it.
 *
 * Returns two strings — the source line and the caret — to allow the caller
 * to push them individually into the output array without concatenation.
 */
function renderActiveLine(
    lineNumber: number,
    source: string,
    gutterWidth: number,
    targetColumn: number,
    caretWidth: number,
): [sourceLine: string, caretLine: string] {
    const label = String(lineNumber).padStart(gutterWidth);
    const sourceLine = `${pc.red('>')} ${pc.bold(label)} ${pc.dim('│')} ${source}`;

    const prefixWidth = GUTTER_ARROW_WIDTH + gutterWidth + GUTTER_PIPE_WIDTH;
    const caretOffset = Math.max(0, targetColumn - 1);
    const caretLine = ' '.repeat(prefixWidth) + ' '.repeat(caretOffset) + pc.red('^'.repeat(caretWidth));

    return [sourceLine, caretLine];
}

// ---------------------------------------------------------------------------
// Frame renderer — public entry point
// ---------------------------------------------------------------------------

/**
 * Renders a Biome-style code frame for a single violation.
 *
 * Returns an array of coloured strings — no leading padding; caller owns indent.
 * Returns an empty array when `lines` is empty (unreadable or missing file).
 *
 * Layout:
 *   "  {n} │ {source}"   ← context rows (dim)
 *   "> {n} │ {source}"   ← active row (normal)
 *   "      │ {col}^^^^"  ← caret row (red ^^^^^ spanning the token)
 *
 * @param lines        - All source lines for the file (from `readSourceLines`).
 * @param targetLine   - 1-indexed line number of the violation.
 * @param targetColumn - 1-indexed column number of the violation.
 * @returns Coloured frame strings ready to be written to the output.
 */
export function renderCodeFrame(
    lines: string[],
    targetLine: number,
    targetColumn: number,
): string[] {
    if (lines.length === 0) return [];

    const firstLine = Math.max(1, targetLine - CONTEXT_LINES);
    const lastLine = Math.min(lines.length, targetLine + CONTEXT_LINES);
    const gutterWidth = String(lastLine).length;

    const activeSrc = lines[targetLine - 1] ?? '';
    const caretWidth = inferTokenLength(activeSrc, targetColumn);

    const rendered: string[] = [];

    for (let lineNumber = firstLine; lineNumber <= lastLine; lineNumber++) {
        const source = lines[lineNumber - 1] ?? '';

        if (lineNumber === targetLine) {
            const [sourceLine, caretLine] = renderActiveLine(
                lineNumber,
                source,
                gutterWidth,
                targetColumn,
                caretWidth,
            );
            rendered.push(sourceLine, caretLine);
        } else {
            rendered.push(renderContextLine(lineNumber, source, gutterWidth));
        }
    }

    return rendered;
}
