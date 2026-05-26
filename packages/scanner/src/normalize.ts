import path from 'node:path';
import type { NormalizedOptions, ScanOptions } from './types.js';

const DEFAULT_INCLUDE = [
  '**/*.ts',
  '**/*.html',
  '**/*.scss',
  '**/*.css',
  '**/*.sass',
  '**/*.less',
] as const;

export const normalizeOptions = (options: ScanOptions): NormalizedOptions => ({
  rootDir: path.resolve(options.rootDir),
  include: options.include.length > 0 ? options.include : DEFAULT_INCLUDE,
  exclude: options.exclude,
  ignorePatterns: options.ignorePatterns ?? [],
  respectGitignore: options.respectGitignore ?? true,
  followSymlinks: options.followSymlinks ?? false,
  dot: options.dot ?? false,
});

export const validateOptions = (
  options: ScanOptions
): ReadonlyArray<string> => {
  const errors: string[] = [];

  if (!options.rootDir || options.rootDir.trim() === '') {
    errors.push('rootDir cannot be empty');
  }

  if (!options.include || options.include.length === 0) {
    errors.push('No include patterns specified (will use defaults)');
  }

  return errors;
};
