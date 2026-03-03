import { access } from 'node:fs/promises';
import { debug, time, timeEnd } from '@ngcompass/common';
import type { ScanOptions, ScanResult, Result, ScanTimings, NormalizedOptions, ExpandedPatterns } from './types.js';
import { Ok, Err } from './types.js';
import { normalizeOptions } from './normalize.js';
import { expandPatterns } from './patterns.js';
import { executeGlob } from './glob.js';
import { isGitRepo, executeGitDiscovery, getRepoFingerprint, getDirectoryFingerprint } from './git.js';
import { applyFilters, filterByGlob } from './filters.js';
import { calculateStats } from './stats.js';

export const scan = async (options: ScanOptions): Promise<Result<ScanResult>> => {
    time('file-scan');
    const startTime = performance.now();

    logScanStart(options);

    const t0 = performance.now();
    const normalized = normalizeOptions(options);
    const patterns = expandPatterns(normalized);
    const normalizationTime = performance.now() - t0;

    logNormalization(normalized, patterns, options.debug);

    // Guard: fail early with a clear message if rootDir does not exist.
    try {
        await access(normalized.rootDir);
    } catch {
        timeEnd('file-scan');
        return Err(new Error(`rootDir does not exist or is not accessible: ${normalized.rootDir}`));
    }

    const isGit = await isGitRepo(normalized.rootDir);

    const cacheResult = await tryLoadFromCache(normalized, patterns, isGit, options);
    if (cacheResult) {
        return await buildCachedResult(cacheResult, startTime, options.debug);
    }

    const t1 = performance.now();
    const discoveryResult = await discoverFiles(normalized, patterns, isGit, options.debug);

    if (!discoveryResult.ok) {
        logAndReturnError('Scan', discoveryResult.error, options.debug);
        return discoveryResult;
    }

    const rawFiles = discoveryResult.data;
    const discoveryTime = performance.now() - t1;

    const t2 = performance.now();
    const filterResult = await applyFilters({ files: rawFiles }, normalized);

    if (!filterResult.ok) {
        logAndReturnError('Filter', filterResult.error, options.debug);
        return filterResult;
    }

    const finalFiles = filterResult.data.files as string[];
    const filteringTime = performance.now() - t2;

    logFiltering(finalFiles.length, filterResult.data.filtered, options.debug);

    await saveToCache(normalized, patterns, finalFiles, isGit, options);

    const stats = await calculateStats(finalFiles, startTime, false);
    const totalTime = timeEnd('file-scan');

    logScanEnd(stats, totalTime, options.debug);

    const timings: ScanTimings = {
        normalization: normalizationTime,
        discovery: discoveryTime,
        filtering: filteringTime,
        total: totalTime
    };

    return Ok({
        files: finalFiles,
        stats,
        timestamp: Date.now(),
        timings: options.debug ? timings : undefined
    });
};

async function discoverFiles(
    normalized: NormalizedOptions,
    patterns: ExpandedPatterns,
    isGit: boolean,
    isDebug?: boolean
): Promise<Result<ReadonlyArray<string>>> {
    if (isGit) {
        if (isDebug) debug('scanner', 'Git repository detected. Using fast Git discovery...');
        const gitFiles = await executeGitDiscovery(normalized.rootDir);

        const filtered = filterByGlob(
            gitFiles,
            patterns.include,
            patterns.ignore,
            normalized.rootDir
        ) as string[];

        if (isDebug) debug('scanner', `Git discovery found ${filtered.length} files (after glob filtering)`);
        return Ok(filtered);
    }

    if (isDebug) debug('scanner', 'Not a Git repository. Falling back to standard globbing...');
    const result = await executeGlob(patterns, normalized.rootDir, {
        followSymlinks: normalized.followSymlinks,
        dot: normalized.dot,
    });

    if (result.ok && isDebug) {
        debug('scanner', `Glob found ${result.data.files.length} files`);
    }

    return result.ok ? Ok(result.data.files) : result;
}

async function getCacheKey(
    normalized: NormalizedOptions,
    patterns: ExpandedPatterns,
    isGit: boolean,
    options: ScanOptions
): Promise<string | null> {
    if (!options.cache) return null;

    // Use the git fingerprint for repos (precise: HEAD + index mtime).
    // Fall back to a directory mtime fingerprint for non-git projects so
    // that even plain directories benefit from caching.
    const fingerprint = isGit
        ? await getRepoFingerprint(normalized.rootDir)
        : await getDirectoryFingerprint(normalized.rootDir);

    if (!fingerprint) return null;

    return options.cache.computeHash([
        normalized.rootDir,
        JSON.stringify(patterns),
        fingerprint,
        'v1'
    ].join('|'));
}

async function tryLoadFromCache(
    normalized: NormalizedOptions,
    patterns: ExpandedPatterns,
    isGit: boolean,
    options: ScanOptions
): Promise<ReadonlyArray<string> | null> {
    const key = await getCacheKey(normalized, patterns, isGit, options);
    if (!key || !options.cache) return null;

    const cached = await options.cache.files.get(key);
    if (cached) {
        if (options.debug) debug('scanner', `Cache HIT. Loaded ${cached.files.length} files.`);
        return cached.files;
    }

    return null;
}

async function saveToCache(
    normalized: NormalizedOptions,
    patterns: ExpandedPatterns,
    files: string[],
    isGit: boolean,
    options: ScanOptions
): Promise<void> {
    if (!options.cache || files.length === 0) return;

    const key = await getCacheKey(normalized, patterns, isGit, options);
    if (key) {
        await options.cache.files.set(key, files);
        if (options.debug) debug('scanner', 'File list cached.');
    }
}

async function buildCachedResult(
    files: ReadonlyArray<string>,
    startTime: number,
    isDebug?: boolean
): Promise<Result<ScanResult>> {
    const stats = await calculateStats(files, startTime, true);
    const totalTime = performance.now() - startTime;

    return Ok({
        files,
        stats,
        timestamp: Date.now(),
        timings: isDebug ? { normalization: 0, discovery: totalTime, filtering: 0, total: totalTime } : undefined
    });
}

function logScanStart(options: ScanOptions): void {
    if (!options.debug) return;
    debug('scanner', `Starting file discovery in: ${options.rootDir}`);
    debug('scanner', `Include patterns: ${options.include.join(', ')}`);
    debug('scanner', `Exclude patterns: ${options.exclude.join(', ')}`);
}

function logNormalization(normalized: NormalizedOptions, patterns: ExpandedPatterns, isDebug?: boolean): void {
    if (!isDebug) return;
    debug('scanner', `Normalized rootDir: ${normalized.rootDir}`);
    debug('scanner', `Expanded to ${patterns.include.length} include patterns, ${patterns.ignore.length} ignore patterns`);
}

function logFiltering(fileCount: number, filteredCount: number, isDebug?: boolean): void {
    if (!isDebug) return;
    debug('scanner', `After filters: ${fileCount} files (${filteredCount} filtered out)`);
}

function logScanEnd(stats: Awaited<ReturnType<typeof calculateStats>>, scanTime: number, isDebug?: boolean): void {
    if (!isDebug) return;

    debug('scanner', `Scan complete: ${stats.totalFiles} files in ${scanTime.toFixed(1)}ms`);

    const breakdown = Array.from(stats.byExtension.entries())
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([ext, count]) => `${ext}:${count}`)
        .join(', ');

    debug('scanner', `Breakdown: ${breakdown}`);

    if (stats.totalFiles === 0) {
        debug('scanner', 'No files found matching patterns. Check your include/exclude configuration.');
    }
}

function logAndReturnError(phase: string, error: Error, isDebug?: boolean): void {
    const scanTime = timeEnd('file-scan');
    if (isDebug) {
        debug('scanner', `${phase} failed after ${scanTime.toFixed(1)}ms: ${error.message}`);
    }
}
