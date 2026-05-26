import { describe, it, expect } from 'vitest';
import {
  normalizePattern,
  expandPatterns,
  isValidPattern,
  validatePatterns,
} from '../src/patterns.js';
import type { NormalizedOptions } from '../src/types.js';

describe('normalizePattern', () => {
  it('replaces backslashes with forward slashes', () => {
    expect(normalizePattern('src\\app\\test.ts')).toBe('src/app/test.ts');
    expect(normalizePattern('C:\\win\\path')).toBe('C:/win/path');
  });

  it('leaves forward slashes unchanged', () => {
    expect(normalizePattern('src/app/test.ts')).toBe('src/app/test.ts');
  });
});

describe('expandPatterns', () => {
  it('combines exclude and ignorePatterns into ignore array', () => {
    const options: NormalizedOptions = {
      rootDir: 'src',
      include: ['src\\**\\*.ts'],
      exclude: ['dist\\**'],
      ignorePatterns: ['.cache'],
      respectGitignore: true,
      followSymlinks: false,
    };

    const result = expandPatterns(options);

    expect(result.include).toEqual(['src/**/*.ts']);
    expect(result.ignore).toEqual(['dist/**', '.cache']);
  });
});

describe('isValidPattern', () => {
  it('returns false for empty pattern', () => {
    expect(isValidPattern('')).toBe(false);
    expect(isValidPattern('   ')).toBe(false);
  });

  it('returns false for triple-star syntax', () => {
    expect(isValidPattern('src/***/test.ts')).toBe(false);
  });

  it('returns true for valid glob patterns', () => {
    expect(isValidPattern('**/*.ts')).toBe(true);
    expect(isValidPattern('!node_modules')).toBe(true);
  });
});

describe('validatePatterns', () => {
  it('separates valid patterns and generates error messages for invalid ones', () => {
    const patterns = ['**/*.ts', '   ', 'src/***/bad.ts', 'valid.ts'];
    const [valid, errors] = validatePatterns(patterns);

    expect(valid).toEqual(['**/*.ts', 'valid.ts']);
    expect(errors).toEqual([
      'Invalid pattern: "   "',
      'Invalid pattern: "src/***/bad.ts"',
    ]);
  });

  it('returns all patterns if all are valid', () => {
    const patterns = ['**/*.ts', 'src/*.html'];
    const [valid, errors] = validatePatterns(patterns);

    expect(valid).toEqual(patterns);
    expect(errors.length).toBe(0);
  });
});
