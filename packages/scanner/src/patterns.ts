import type { ExpandedPatterns, NormalizedOptions } from './models/index.js';

export const normalizePattern = (pattern: string): string =>
  pattern.replace(/\\/g, '/');

export const expandPatterns = (
  options: NormalizedOptions
): ExpandedPatterns => ({
  include: options.include.map(normalizePattern),
  ignore: [
    ...options.exclude.map(normalizePattern),
    ...options.ignorePatterns.map(normalizePattern),
  ],
});

export const isValidPattern = (pattern: string): boolean => {
  if (pattern.trim() === '') return false;
  if (pattern.includes('***')) return false;
  if (pattern.endsWith('/') || pattern.endsWith('\\')) return false;
  if (!balanced(pattern, '{', '}')) return false;
  if (!balanced(pattern, '[', ']')) return false;
  return true;
};

export const validatePatterns = (
  patterns: ReadonlyArray<string>
): readonly [ReadonlyArray<string>, ReadonlyArray<string>] => {
  const valid: string[] = [];
  const errors: string[] = [];
  for (const pattern of patterns) {
    if (isValidPattern(pattern)) valid.push(pattern);
    else errors.push(`Invalid pattern: "${pattern}"`);
  }
  return [valid, errors];
};

function balanced(s: string, open: string, close: string): boolean {
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === open) depth++;
    else if (s[i] === close) depth--;
  }
  return depth === 0;
}
