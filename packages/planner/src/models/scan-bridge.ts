import type { ResolvedRule } from '@ngcompass/common';
import type { CacheContext, CacheKeyContext } from '@ngcompass/cache';
import type { IncrementalFilterOptions } from './incremental.js';

export interface ScanResultBridge {
  readonly files: ReadonlyArray<string>;

  readonly timestamp?: number;
}

export interface ScanToPlanOptions {
  readonly rules: ReadonlyMap<string, ResolvedRule>;

  readonly rootDir: string;

  readonly cache?: CacheContext;

  readonly debug?: boolean;

  readonly incremental?: IncrementalFilterOptions;

  readonly cacheKeyCtx?: CacheKeyContext;

  readonly parallelThreshold?: number;

  readonly workerCount?: number;
}
