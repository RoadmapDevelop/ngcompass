import type { CacheContext } from '@ngcompass/cache';
import { Err, Ok, type Result } from '@ngcompass/common';

export type { Result };
export { Ok, Err };

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

export interface RawFileList {
  readonly files: ReadonlyArray<string>;
}

export interface FilteredFileList {
  readonly files: ReadonlyArray<string>;
  readonly filtered: number;
}

export interface ScanStatistics {
  readonly totalFiles: number;
  readonly byExtension: ReadonlyMap<string, number>;
  readonly totalSize: number;
  readonly scanTime: number;
  readonly cacheHit: boolean;
}

export interface ScanTimings {
  readonly normalization: number;

  readonly discovery: number;
  readonly filtering: number;
  readonly total: number;
}

export interface ScanResult {
  readonly files: ReadonlyArray<string>;
  readonly stats: ScanStatistics;
  readonly timestamp: number;
  readonly timings?: ScanTimings;
}

export type GitignoreFilter = (file: string, rootDir: string) => boolean;

export type ScanPhase =
  | 'normalizing'
  | 'discovering'
  | 'filtering'
  | 'calculating-stats'
  | 'complete';

export type OnProgressCallback = (phase: ScanPhase, count: number) => void;
