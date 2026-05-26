import { describe, it, expect } from 'vitest';
import { parseHtml } from '../../src/parsers/html.js';

describe('parseHtml', () => {
  it('returns parsed root nodes and empty errors for valid html', () => {
    const result = parseHtml('<div>Hello</div>', 0);
    expect(result.errors.length).toBe(0);
    expect(result.rootNodes.length).toBeGreaterThan(0);
    expect(result.templateStartOffset).toBe(0);
  });

  it('handles templateStartOffset correctly', () => {
    const result = parseHtml('<span>Hi</span>', 10);
    expect(result.templateStartOffset).toBe(10);
  });
});
