import fs from 'node:fs';
import pc from 'picocolors';
import { codeFrameColumns } from '@babel/code-frame';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Lines of source context shown above and below the violation line. */
const CONTEXT_LINES = 2;
const FRAME_PADDING = '  ';

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

function highlightHtml(line: string): string {
    return pc.green(line);
}

function renderHtmlCodeFrame(
    lines: string[],
    targetLine: number,
    targetColumn: number,
): string[] {
    if (targetLine < 1 || targetLine > lines.length) return [];

    const startLine = Math.max(1, targetLine - CONTEXT_LINES);
    const endLine = Math.min(lines.length, targetLine + CONTEXT_LINES);
    const gutterWidth = String(endLine).length;
    const rendered: string[] = [];

    for (let lineNo = startLine; lineNo <= endLine; lineNo++) {
        const raw = lines[lineNo - 1] ?? '';
        const active = lineNo === targetLine;
        const marker = active ? pc.red('>') : ' ';
        const gutter = String(lineNo).padStart(gutterWidth, ' ');
        const pipe = `${pc.blue(gutter)} ${pc.blue('|')}`;
        const code = highlightHtml(raw);

        rendered.push(`${FRAME_PADDING}${marker} ${pipe} ${code}`);

        if (active) {
            const trimmed = raw.trimEnd();
            const firstNonSpace = raw.search(/\S/);
            const startColumn = firstNonSpace === -1 ? Math.max(1, targetColumn) : firstNonSpace + 1;
            const endColumn = Math.max(startColumn, trimmed.length + 1);
            const caretPadding = ' '.repeat(Math.max(0, startColumn - 1));
            const caretLength = Math.max(1, endColumn - startColumn);
            const emptyPipe = `${' '.repeat(gutterWidth)} ${pc.blue('|')}`;
            rendered.push(`${FRAME_PADDING}  ${emptyPipe} ${caretPadding}${pc.red('^'.repeat(caretLength))}`);
        }
    }

    return rendered;
}

// ---------------------------------------------------------------------------
// Frame renderer — public entry point
// ---------------------------------------------------------------------------

/**
 * Renders a code frame for a single violation using @babel/code-frame.
 *
 * @param lines        - All source lines for the file (from `readSourceLines`).
 * @param targetLine   - 1-indexed line number of the violation.
 * @param _targetColumn - 1-indexed column number of the violation (ignored for full-line highlight).
 * @param filePath      - Optional path to determine language highlighting.
 * @returns Coloured frame strings ready to be written to the output.
 */
export function renderCodeFrame(
    lines: string[],
    targetLine: number,
    _targetColumn: number,
    filePath?: string,
): string[] {
    if (lines.length === 0) return [];

    const isHtml = filePath?.toLowerCase().endsWith('.html');
    if (isHtml) {
        return renderHtmlCodeFrame(lines, targetLine, _targetColumn);
    }

    const rawSource = lines.join('\n');

    const activeLineContent = lines[targetLine - 1] ?? '';
    const trimmed = activeLineContent.trimEnd();
    const firstNonSpace = activeLineContent.search(/\S/);
    const startColumn = firstNonSpace === -1 ? 1 : firstNonSpace + 1;
    const endColumn = Math.max(startColumn, trimmed.length + 1);

    const frame = codeFrameColumns(
        rawSource,
        {
            start: { line: targetLine, column: startColumn },
            end: { line: targetLine, column: endColumn },
        },
        {
            highlightCode: true,
            linesAbove: CONTEXT_LINES,
            linesBelow: CONTEXT_LINES,
        },
    );

    // Babel produces a multiline string. We split it to apply our custom padding and indicators.
    return frame.split('\n').map((line) => {
        let processed = line;

        // 1. Detect active line vs context line
        const isActive = line.trimStart().startsWith('>');
        const isCaretLine = line.includes('^');

        // 2. Extract and color the gutter (line numbers / pipe)
        processed = processed.replace(/(\s*)(\d+)(\s*\|)/, (_, s1, num, s2) => {
            return s1 + pc.blue(num) + pc.blue(s2);
        });

        // 3. Style the indicator (Cyan ❯)
        if (isActive) {
            processed = processed.replace('>', pc.cyan('❯'));
        } else {
            // Adjust prefix for alignment
            processed = ' ' + processed;
        }

        // 4. Style the caret (Bright Red)
        if (isCaretLine) {
            processed = processed.replace(/\^+/g, (match) => pc.red(match));
        }

        // 5. Style comments (Italicized Dim Grey)
        processed = processed.replace(/(\/\/.*|\/\*.*?\*\/)/g, (match) => {
            return pc.dim(pc.italic(pc.gray(match)));
        });

        // Add 2 spaces of left padding for a "less crowded" look.
        return FRAME_PADDING + processed;
    });
}
