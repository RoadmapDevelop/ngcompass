import type {
  ExecutionPlanOptions,
  ScanResultBridge,
  ScanToPlanOptions,
} from './models/index.js';

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
