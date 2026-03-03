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

/**
 * Scans directories to find files based on provided glob patterns, applying
 * filters (including .gitignore overrides) and optimizations for Git repositories.
 * The operation can also be optionally sped up by using a file caching layer. 
 *
 * @param options - Configuration settings indicating directories, patterns, and behaviors.
 * @returns Promise yielding a Result containing the discovered file paths and scan execution statistics.
 */
export const scan = async (options: ScanOptions): Promise<Result<ScanResult>> => {
    time('file-scan');
    const startTime = performance.now();

    logScanStart(options);

    const t0 = performance.now();
    const normalized = normalizeOptions(options);
    const patterns = expandPatterns(normalized);
    const normalizationTime = performance.now() - t0;

    logNormalization(normalized, patterns);

    try {
        await access(normalized.rootDir);
    } catch {
        timeEnd('file-scan');
        return Err(new Error(`rootDir does not exist or is not accessible: ${normalized.rootDir}`));
    }

    const isGit = await isGitRepo(normalized.rootDir);

    const cacheResult = await tryLoadFromCache(normalized, patterns, isGit, options);
    if (cacheResult) {
        return await buildCachedResult(cacheResult, startTime);
    }

    const t1 = performance.now();
    const discoveryResult = await discoverFiles(normalized, patterns, isGit);

    if (!discoveryResult.ok) {
        logAndReturnError('Scan', discoveryResult.error);
        return discoveryResult;
    }

    const rawFiles = discoveryResult.data;
    const discoveryTime = performance.now() - t1;

    const t2 = performance.now();
    const filterResult = await applyFilters({ files: rawFiles }, normalized);

    if (!filterResult.ok) {
        logAndReturnError('Filter', filterResult.error);
        return filterResult;
    }

    const finalFiles = filterResult.data.files as string[];
    const filteringTime = performance.now() - t2;

    logFiltering(finalFiles.length, filterResult.data.filtered);

    await saveToCache(normalized, patterns, finalFiles, isGit, options);

    const stats = await calculateStats(finalFiles, startTime, false);
    const totalTime = timeEnd('file-scan');

    logScanEnd(stats, totalTime);

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
        timings: timings
    });
};

/**
 * Discovers the raw set of files using Git-optimized utilities or standard filesystem globbing.
 *
 * @param normalized - The normalized subset of user configurations.
 * @param patterns - Include and ignore patterns processed from raw glob expressions.
 * @param isGit - True if the root system directory is verified to be a Git repository.
 * @param isDebug - Controls debugging output emission.
 * @returns A Result array of string paths corresponding to matching patterns before any deep filtering.
 */
async function discoverFiles(
    normalized: NormalizedOptions,
    patterns: ExpandedPatterns,
    isGit: boolean
): Promise<Result<ReadonlyArray<string>>> {
    if (isGit) {
        debug('scanner', 'Git repository detected. Using fast Git discovery...');
        const gitFiles = await executeGitDiscovery(normalized.rootDir);

        const filtered = filterByGlob(
            gitFiles,
            patterns.include,
            patterns.ignore,
            normalized.rootDir
        ) as string[];

        debug('scanner', `Git discovery found ${filtered.length} files (after glob filtering)`);
        return Ok(filtered);
    }

    debug('scanner', 'Not a Git repository. Falling back to standard globbing...');
    const result = await executeGlob(patterns, normalized.rootDir, {
        followSymlinks: normalized.followSymlinks,
        dot: normalized.dot,
    });

    if (result.ok) {
        debug('scanner', `Glob found ${result.data.files.length} files`);
    }

    return result.ok ? Ok(result.data.files) : result;
}

/**
 * Resolves an active string key targeting internal cache mappings, relying on a robust system fingerprint.
 *
 * @param normalized - Contains the root directory config used in fingerprint verification.
 * @param patterns - Current pattern strings impacting final cache validity.
 * @param isGit - Informs how the directory fingerprint computes.
 * @param options - The full operation configuration, providing access to the injected cache engine. 
 * @returns Nullable resolved cache key string.
 */
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

/**
 * Checks to see if an identical scan has completed before by retrieving paths from the configured cache context.
 *
 * @param normalized - Operation configuration settings.
 * @param patterns - Expanded pattern sets mapping matched inputs.
 * @param isGit - Dictates fingerprint resolution paths for verification check.
 * @param options - Full base configurations giving cache instances.
 * @returns The resulting cached file paths as an Array, or strictly null on a cache miss.
 */
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
        debug('scanner', `Cache HIT. Loaded ${cached.files.length} files.`);
        return cached.files;
    }

    return null;
}

/**
 * Persists successfully discovered and verified pathways to cache for future invocations bypassing tree search.
 *
 * @param normalized - Operation configuration settings.
 * @param patterns - Relevant expanded string patterns utilized during discovery.
 * @param files - Computed list of file paths needing persistence.
 * @param isGit - Assures Git directory resolution paths match load counterparts.
 * @param options - Scan config options controlling the target caching interface properties.
 */
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
        debug('scanner', 'File list cached.');
    }
}

async function buildCachedResult(
    files: ReadonlyArray<string>,
    startTime: number
): Promise<Result<ScanResult>> {
    const stats = await calculateStats(files, startTime, true);
    const totalTime = performance.now() - startTime;

    return Ok({
        files,
        stats,
        timestamp: Date.now(),
        timings: { normalization: 0, discovery: totalTime, filtering: 0, total: totalTime }
    });
}

function logScanStart(options: ScanOptions): void {
    debug('scanner', `Starting file discovery in: ${options.rootDir}`);
    debug('scanner', `Include patterns: ${options.include.join(', ')}`);
    debug('scanner', `Exclude patterns: ${options.exclude.join(', ')}`);
}

function logNormalization(normalized: NormalizedOptions, patterns: ExpandedPatterns): void {
    debug('scanner', `Normalized rootDir: ${normalized.rootDir}`);
    debug('scanner', `Expanded to ${patterns.include.length} include patterns, ${patterns.ignore.length} ignore patterns`);
}

function logFiltering(fileCount: number, filteredCount: number): void {
    debug('scanner', `After filters: ${fileCount} files (${filteredCount} filtered out)`);
}

function logScanEnd(stats: Awaited<ReturnType<typeof calculateStats>>, scanTime: number): void {
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

function logAndReturnError(phase: string, error: Error): void {
    const scanTime = timeEnd('file-scan');
    debug('scanner', `${phase} failed after ${scanTime.toFixed(1)}ms: ${error.message}`);
}
