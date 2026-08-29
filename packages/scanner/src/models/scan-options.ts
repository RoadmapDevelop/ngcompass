import type { CacheContext } from '@ngcompass/cache';
import type { OnProgressCallback } from './scan-progress.js';

export type Option<T> = T | null | undefined;

export interface ScanOptions {
  readonly rootDir: string;
  readonly include: ReadonlyArray<string>;
  readonly exclude: ReadonlyArray<string>;
  readonly ignorePatterns?: ReadonlyArray<string>;
  readonly respectGitignore?: boolean;
  readonly followSymlinks?: boolean;

  readonly dot?: boolean;
  readonly debug?: boolean;
  readonly cache?: CacheContext;

  readonly onProgress?: OnProgressCallback;

  readonly tsConfigPath?: string;
}

export interface NormalizedOptions {
  readonly rootDir: string;
  readonly include: ReadonlyArray<string>;
  readonly exclude: ReadonlyArray<string>;
  readonly ignorePatterns: ReadonlyArray<string>;
  readonly respectGitignore: boolean;
  readonly followSymlinks: boolean;

  readonly dot: boolean;
}

export interface ExpandedPatterns {
  readonly include: ReadonlyArray<string>;
  readonly ignore: ReadonlyArray<string>;
}
