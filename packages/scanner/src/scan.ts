import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  debug,
  Err,
  Ok,
  stableSerialize,
  time,
  timeEnd,
  type Result,
} from '@ngcompass/common';
import type { FileCacheEntry } from '@ngcompass/cache';
import { applyFilters, filterByGlob } from './filters.js';
import { executeGlob } from './glob.js';
import {
  executeGitDiscovery,
  getDirectoryFingerprint,
  getRepoFingerprint,
  isGitRepo,
} from './git.js';
import { normalizeOptions } from './normalize.js';
import { expandPatterns } from './patterns.js';
import { calculateStats } from './stats.js';
import type {
  ExpandedPatterns,
  NormalizedOptions,
  OnProgressCallback,
  ScanOptions,
  ScanResult,
  ScanStatistics,
  ScanTimings,
} from './models/index.js';

const SCAN_CACHE_VERSION = 'v1';

export const scan = async (
  options: ScanOptions
): Promise<Result<ScanResult>> => {
  time('file-scan');
  const startTime = performance.now();
  const progress: OnProgressCallback = options.onProgress ?? (() => undefined);

  logScanStart(options);
  progress('normalizing', 0);

  const t0 = performance.now();
  const normalized = normalizeOptions(options);
  let patterns = expandPatterns(normalized);
  const normalizationTime = performance.now() - t0;
  logNormalization(normalized, patterns);

  if (options.tsConfigPath) {
    const tsPatterns = await loadTsConfigPatterns(
      options.tsConfigPath,
      normalized.rootDir
    );
    if (tsPatterns) {
      patterns = mergeTsConfigPatterns(patterns, tsPatterns);
      debug(
        'scanner',
        `tsconfig patterns merged: +${tsPatterns.include.length} include, +${tsPatterns.exclude.length} exclude`
      );
    }
  }

  try {
    await access(normalized.rootDir);
  } catch {
    timeEnd('file-scan');
    return Err(
      new Error(
        `rootDir does not exist or is not accessible: ${normalized.rootDir}`
      )
    );
  }

  const isGit = await isGitRepo(normalized.rootDir);

  const cacheResult = await tryLoadFromCache(
    normalized,
    patterns,
    isGit,
    options
  );
  if (cacheResult) {
    progress('complete', cacheResult.files.length);
    return buildCachedResult(cacheResult, startTime);
  }

  progress('discovering', 0);
  const t1 = performance.now();
  const discoveryResult = await discoverFiles(normalized, patterns, isGit);
  if (!discoveryResult.ok) {
    logAndReturnError('Scan', discoveryResult.error);
    return discoveryResult;
  }

  const rawFiles = discoveryResult.data;
  const discoveryTime = performance.now() - t1;
  progress('filtering', rawFiles.length);

  const t2 = performance.now();
  const filterResult = await applyFilters({ files: rawFiles }, normalized);
  if (!filterResult.ok) {
    logAndReturnError('Filter', filterResult.error);
    return filterResult;
  }

  const finalFiles = filterResult.data.files;
  const filteringTime = performance.now() - t2;
  logFiltering(finalFiles.length, filterResult.data.filtered);

  progress('calculating-stats', finalFiles.length);
  const stats = await calculateStats(finalFiles, startTime, false);
  await saveToCache(
    normalized,
    patterns,
    finalFiles,
    serializeScanStats(stats),
    isGit,
    options
  );

  const totalTime = timeEnd('file-scan');
  logScanEnd(stats, totalTime);
  progress('complete', finalFiles.length);

  const timings: ScanTimings = {
    normalization: normalizationTime,
    discovery: discoveryTime,
    filtering: filteringTime,
    total: totalTime,
  };
  return Ok({ files: finalFiles, stats, timestamp: Date.now(), timings });
};

async function discoverFiles(
  normalized: NormalizedOptions,
  patterns: ExpandedPatterns,
  isGit: boolean
): Promise<Result<ReadonlyArray<string>>> {
  if (isGit) {
    debug('scanner', 'Git repository detected. Using fast Git discovery...');
    const gitFiles = await executeGitDiscovery(normalized.rootDir);

    if (gitFiles.length === 0) {
      debug(
        'scanner',
        'Git discovery returned 0 files — falling back to glob-based scanning.'
      );
      return runGlobDiscovery(normalized, patterns);
    }

    const filtered = filterByGlob(
      gitFiles,
      patterns.include,
      patterns.ignore,
      normalized.rootDir
    );
    debug(
      'scanner',
      `Git discovery found ${filtered.length} files (after glob filtering)`
    );
    return Ok(filtered);
  }

  debug(
    'scanner',
    'Not a Git repository. Falling back to standard globbing...'
  );
  return runGlobDiscovery(normalized, patterns);
}

async function runGlobDiscovery(
  normalized: NormalizedOptions,
  patterns: ExpandedPatterns
): Promise<Result<ReadonlyArray<string>>> {
  const result = await executeGlob(patterns, normalized.rootDir, {
    followSymlinks: normalized.followSymlinks,
    dot: normalized.dot,
  });
  if (!result.ok) return result;
  debug('scanner', `Glob found ${result.data.files.length} files`);
  return Ok(result.data.files);
}

async function getCacheKey(
  normalized: NormalizedOptions,
  patterns: ExpandedPatterns,
  isGit: boolean,
  options: ScanOptions
): Promise<string | null> {
  if (!options.cache) return null;

  const fingerprint = isGit
    ? await getRepoFingerprint(normalized.rootDir)
    : await getDirectoryFingerprint(normalized.rootDir);

  if (!fingerprint) return null;

  return options.cache.computeHash(
    [
      normalized.rootDir,
      stableSerialize(patterns),
      fingerprint,
      SCAN_CACHE_VERSION,
    ].join('|')
  );
}

async function tryLoadFromCache(
  normalized: NormalizedOptions,
  patterns: ExpandedPatterns,
  isGit: boolean,
  options: ScanOptions
): Promise<FileCacheEntry | null> {
  const key = await getCacheKey(normalized, patterns, isGit, options);
  if (!key || !options.cache) return null;

  const cached = await options.cache.files.get(key);
  if (cached) {
    debug('scanner', `Cache HIT. Loaded ${cached.files.length} files.`);
    return cached;
  }
  return null;
}

async function saveToCache(
  normalized: NormalizedOptions,
  patterns: ExpandedPatterns,
  files: ReadonlyArray<string>,
  stats: CachedScanStatistics,
  isGit: boolean,
  options: ScanOptions
): Promise<void> {
  if (!options.cache || files.length === 0) return;

  const key = await getCacheKey(normalized, patterns, isGit, options);
  if (!key) return;

  await options.cache.files.set(key, [...files], stats);
  debug('scanner', 'File list cached.');
}

function buildCachedResult(
  cached: FileCacheEntry,
  startTime: number
): Result<ScanResult> {
  const totalTime = performance.now() - startTime;
  const cachedStats = normalizeCachedStats(cached.stats);

  const stats: ScanStatistics = cachedStats
    ? { ...cachedStats, scanTime: totalTime, cacheHit: true }
    : {
        totalFiles: cached.files.length,
        byExtension: groupCachedFilesByExtension(cached.files),
        totalSize: 0,
        scanTime: totalTime,
        cacheHit: true,
      };

  return Ok({
    files: cached.files,
    stats,
    timestamp: Date.now(),

    timings: {
      normalization: 0,
      discovery: totalTime,
      filtering: 0,
      total: totalTime,
    },
  });
}

interface CachedScanStatistics {
  readonly totalFiles: number;
  readonly byExtension: ReadonlyArray<readonly [string, number]>;
  readonly totalSize: number;
  readonly scanTime: number;
  readonly cacheHit: boolean;
}

function serializeScanStats(stats: ScanStatistics): CachedScanStatistics {
  return {
    totalFiles: stats.totalFiles,
    byExtension: Array.from(stats.byExtension.entries()),
    totalSize: stats.totalSize,
    scanTime: stats.scanTime,
    cacheHit: stats.cacheHit,
  };
}

function groupCachedFilesByExtension(
  files: ReadonlyArray<string>
): ReadonlyMap<string, number> {
  const byExtension = new Map<string, number>();
  for (const file of files) {
    const ext = path.extname(file) || '.no-extension';
    byExtension.set(ext, (byExtension.get(ext) ?? 0) + 1);
  }
  return byExtension;
}

function normalizeCachedStats(value: unknown): ScanStatistics | null {
  if (!value || typeof value !== 'object') return null;
  const stats = value as Partial<CachedScanStatistics>;
  if (
    typeof stats.totalFiles !== 'number' ||
    typeof stats.totalSize !== 'number' ||
    typeof stats.scanTime !== 'number' ||
    typeof stats.cacheHit !== 'boolean'
  ) {
    return null;
  }

  const byExtension = normalizeExtensionCounts(stats.byExtension);
  if (!byExtension) return null;

  return {
    totalFiles: stats.totalFiles,
    byExtension,
    totalSize: stats.totalSize,
    scanTime: stats.scanTime,
    cacheHit: stats.cacheHit,
  };
}

function normalizeExtensionCounts(
  value: unknown
): ReadonlyMap<string, number> | null {
  if (value instanceof Map) return value;
  if (!Array.isArray(value)) return null;

  const byExtension = new Map<string, number>();
  for (const entry of value) {
    if (!Array.isArray(entry) || entry.length !== 2) return null;
    const [extension, count] = entry;
    if (typeof extension !== 'string' || typeof count !== 'number') return null;
    byExtension.set(extension, count);
  }
  return byExtension;
}

function logScanStart(options: ScanOptions): void {
  debug('scanner', `Starting file discovery in: ${options.rootDir}`);
  debug('scanner', `Include patterns: ${options.include.join(', ')}`);
  debug('scanner', `Exclude patterns: ${options.exclude.join(', ')}`);
}

function logNormalization(
  normalized: NormalizedOptions,
  patterns: ExpandedPatterns
): void {
  debug('scanner', `Normalized rootDir: ${normalized.rootDir}`);
  debug(
    'scanner',
    `Expanded to ${patterns.include.length} include patterns, ${patterns.ignore.length} ignore patterns`
  );
}

function logFiltering(fileCount: number, filteredCount: number): void {
  debug(
    'scanner',
    `After filters: ${fileCount} files (${filteredCount} filtered out)`
  );
}

function logScanEnd(stats: ScanStatistics, scanTime: number): void {
  debug(
    'scanner',
    `Scan complete: ${stats.totalFiles} files in ${scanTime.toFixed(1)}ms`
  );

  const breakdown = Array.from(stats.byExtension.entries())
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([ext, count]) => `${ext}:${count}`)
    .join(', ');
  debug('scanner', `Breakdown: ${breakdown}`);

  if (stats.totalFiles === 0) {
    debug(
      'scanner',
      'No files found matching patterns. Check your include/exclude configuration.'
    );
  }
}

function logAndReturnError(phase: string, error: Error): void {
  const scanTime = timeEnd('file-scan');
  debug(
    'scanner',
    `${phase} failed after ${scanTime.toFixed(1)}ms: ${error.message}`
  );
}

interface TsConfigPatterns {
  readonly include: ReadonlyArray<string>;
  readonly exclude: ReadonlyArray<string>;
}

async function loadTsConfigPatterns(
  tsConfigPath: string,
  rootDir: string
): Promise<TsConfigPatterns | null> {
  try {
    const raw = await readFile(tsConfigPath, 'utf-8');
    const stripped = raw
      .replace(/\/\/[^\n]*/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '');

    const config = JSON.parse(stripped) as {
      include?: string[];
      exclude?: string[];
      files?: string[];
    };

    const configDir = path.dirname(path.resolve(tsConfigPath));
    const toRootRelative = (p: string): string =>
      path.relative(rootDir, path.resolve(configDir, p)).replace(/\\/g, '/');

    const include: string[] = [];
    const exclude: string[] = [];
    if (Array.isArray(config.include))
      include.push(...config.include.map(toRootRelative));
    if (Array.isArray(config.files))
      include.push(...config.files.map(toRootRelative));
    if (Array.isArray(config.exclude))
      exclude.push(...config.exclude.map(toRootRelative));

    return { include, exclude };
  } catch (err) {
    debug(
      'scanner',
      `Failed to load tsconfig patterns from ${tsConfigPath}: ${err instanceof Error ? err.message : String(err)}`
    );
    return null;
  }
}

function mergeTsConfigPatterns(
  patterns: ExpandedPatterns,
  tsPatterns: TsConfigPatterns
): ExpandedPatterns {
  return {
    include:
      tsPatterns.include.length > 0
        ? [...patterns.include, ...tsPatterns.include]
        : patterns.include,
    ignore:
      tsPatterns.exclude.length > 0
        ? [...patterns.ignore, ...tsPatterns.exclude]
        : patterns.ignore,
  };
}
