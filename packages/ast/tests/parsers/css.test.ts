import { describe, it, expect } from 'vitest';
import { parseCss } from '../../src/parsers/css.js';

describe('parseCss', () => {
  it('returns ok for valid css', () => {
    const result = parseCss('.class { color: red; }', 'test.css');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.code).toBeDefined();
    }
  });

  it('returns error for invalid css', () => {
    const result = parseCss('.class { color: red;;!@# ', 'test.css');
    expect(result.ok).toBe(false);
  });
});
