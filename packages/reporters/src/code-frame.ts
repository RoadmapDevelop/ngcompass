import fs from 'node:fs';
import pc from 'picocolors';
import { codeFrameColumns } from '@babel/code-frame';
import type { SourceReader } from './models/index.js';

const CONTEXT_LINES = 2;
const FRAME_PADDING = '  ';

const sourceCache = new Map<string, string[]>();

export function readSourceLines(filePath: string): string[] {
  const cached = sourceCache.get(filePath);
  if (cached !== undefined) return cached;

  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    sourceCache.set(filePath, lines);
    return lines;
  } catch {
    sourceCache.set(filePath, []);
    return [];
  }
}

export function clearSourceCache(): void {
  sourceCache.clear();
}

export const defaultSourceReader: SourceReader = {
  readLines: readSourceLines,
};

function highlightHtml(line: string): string {
  return pc.green(line);
}

function renderHtmlCodeFrame(
  lines: string[],
  targetLine: number,
  targetColumn: number
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
      const startColumn =
        firstNonSpace === -1 ? Math.max(1, targetColumn) : firstNonSpace + 1;
      const endColumn = Math.max(startColumn, trimmed.length + 1);
      const caretPadding = ' '.repeat(Math.max(0, startColumn - 1));
      const caretLength = Math.max(1, endColumn - startColumn);
      const emptyPipe = `${' '.repeat(gutterWidth)} ${pc.blue('|')}`;
      rendered.push(
        `${FRAME_PADDING}  ${emptyPipe} ${caretPadding}${pc.red('^'.repeat(caretLength))}`
      );
    }
  }

  return rendered;
}

export function renderCodeFrame(
  lines: string[],
  targetLine: number,
  _targetColumn: number,
  filePath?: string
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
    }
  );

  return frame.split('\n').map((line) => {
    let processed = line;

    const isActive = line.trimStart().startsWith('>');
    const isCaretLine = line.includes('^');

    processed = processed.replace(/(\s*)(\d+)(\s*\|)/, (_, s1, num, s2) => {
      return s1 + pc.blue(num) + pc.blue(s2);
    });

    if (isActive) {
      processed = processed.replace('>', pc.cyan('❯'));
    } else {
      processed = ' ' + processed;
    }

    if (isCaretLine) {
      processed = processed.replace(/\^+/g, (match) => pc.red(match));
    }

    processed = processed.replace(/(\/\/.*|\/\*.*?\*\/)/g, (match) => {
      return pc.dim(pc.italic(pc.gray(match)));
    });

    return FRAME_PADDING + processed;
  });
}
