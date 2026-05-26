import { describe, it, expect } from 'vitest';
import { rules } from '../src/index.js';

describe('Rules Setup', () => {
  it('should export self', () => {
    expect(rules).toBe('@ngcompass/rules');
  });
});
