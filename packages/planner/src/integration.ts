import type { ResolvedRule } from '@ngcompass/common';
import type { CacheContext, CacheKeyContext } from '@ngcompass/cache';
import type {
  ExecutionPlanOptions,
  IncrementalFilterOptions,
} from './types.js';

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

export const scanResultToPlanInput = (
  scanResult: ScanResultBridge,
  opts: ScanToPlanOptions
): ExecutionPlanOptions => {
  return {
    files: scanResult.files,
    rules: opts.rules,
    rootDir: opts.rootDir,
    cache: opts.cache,
    debug: opts.debug,
    incremental: opts.incremental,
    cacheKeyCtx: opts.cacheKeyCtx,
    parallelThreshold: opts.parallelThreshold,
    workerCount: opts.workerCount,
  };
};

export const hasScanFiles = (scanResult: ScanResultBridge): boolean =>
  scanResult.files.length > 0;

export const getScanFileCount = (scanResult: ScanResultBridge): number =>
  scanResult.files.length;
