import { describe, expect, it } from 'vitest';
import { defineConfig } from '../src/define-config.js';

describe('defineConfig', () => {
  it('returns the config unchanged while preserving typed config shape', () => {
    const config = {
      extends: ['ngcompass:recommended', 'ngcompass:performance'],
      include: ['src/**/*.ts', 'src/**/*.html'],
      failOnSeverity: 'error' as const,
    };

    expect(defineConfig(config)).toBe(config);
  });
});
