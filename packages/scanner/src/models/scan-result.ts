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
