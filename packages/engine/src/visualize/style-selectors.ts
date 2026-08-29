import { Locator } from '@ngcompass/common';
import type { StyleSelector } from '../models/index.js';
const BLOCK_COMMENT_RE = /\/\*[\s\S]*?\*\//g;
const LINE_COMMENT_RE = /(^|[^:])\/\/[^\n]*/g;
const RULE_PRELUDE_RE = /([^{}();@]+)\{/g;
const WHITESPACE_RE = /\s+/g;
const SELECTOR_LIMIT = 200;

function stripComments(content: string): string {
  BLOCK_COMMENT_RE.lastIndex = 0;
  LINE_COMMENT_RE.lastIndex = 0;
  const withoutBlocks = content.replace(BLOCK_COMMENT_RE, (match) =>
    ' '.repeat(match.length)
  );
  return withoutBlocks.replace(LINE_COMMENT_RE, (match, lead: string) =>
    lead + ' '.repeat(match.length - lead.length)
  );
}

function isSelectorPrelude(prelude: string): boolean {
  if (prelude.length === 0) return false;
  if (prelude.startsWith('@')) return false;
  if (prelude.includes(':') && prelude.includes('$')) return false;
  return true;
}

export function collectStyleSelectors(
  content: string,
  locator: Locator
): readonly StyleSelector[] {
  const stripped = stripComments(content);
  const selectors: StyleSelector[] = [];
  const seen = new Set<string>();

  RULE_PRELUDE_RE.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = RULE_PRELUDE_RE.exec(stripped)) !== null) {
    if (selectors.length >= SELECTOR_LIMIT) break;

    const raw = match[1];
    const prelude = raw.trim().replace(WHITESPACE_RE, ' ');
    if (!isSelectorPrelude(prelude)) continue;

    const preludeOffset = match.index + raw.length - raw.trimStart().length;
    const at = locator.location(preludeOffset);

    for (const part of prelude.split(',')) {
      const name = part.trim();
      if (name.length === 0 || seen.has(name)) continue;
      seen.add(name);
      selectors.push({ name, line: at.line, column: at.column });
    }
  }

  return selectors;
}
