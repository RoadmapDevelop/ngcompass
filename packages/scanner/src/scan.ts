import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { debug, time, timeEnd } from '@ngcompass/common';
import type { ScanOptions, ScanResult, Result, ScanTimings, NormalizedOptions, ExpandedPatterns, OnProgressCallback } from './types.js';
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
    const progress: OnProgressCallback = options.onProgress ?? (() => undefined);

    logScanStart(options);
    progress('normalizing', 0);

    const t0 = performance.now();
    const normalized = normalizeOptions(options);
    let patterns = expandPatterns(normalized);
    const normalizationTime = performance.now() - t0;

    logNormalization(normalized, patterns);

    // Optionally narrow include/exclude patterns using a tsconfig.json.
    if (options.tsConfigPath) {
        const tsPatterns = await loadTsConfigPatterns(options.tsConfigPath, normalized.rootDir);
        if (tsPatterns) {
            patterns = mergeTsConfigPatterns(patterns, tsPatterns);
            debug('scanner', `tsconfig patterns merged: +${tsPatterns.include.length} include, +${tsPatterns.exclude.length} exclude`);
        }
    }

    try {
        await access(normalized.rootDir);
    } catch {
        timeEnd('file-scan');
        return Err(new Error(`rootDir does not exist or is not accessible: ${normalized.rootDir}`));
    }

    const isGit = await isGitRepo(normalized.rootDir);

    const cacheResult = await tryLoadFromCache(normalized, patterns, isGit, options);
    if (cacheResult) {
        progress('complete', cacheResult.length);
        return await buildCachedResult(cacheResult, startTime);
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

    const finalFiles = filterResult.data.files as string[];
    const filteringTime = performance.now() - t2;

    logFiltering(finalFiles.length, filterResult.data.filtered);
    progress('calculating-stats', finalFiles.length);

    await saveToCache(normalized, patterns, finalFiles, isGit, options);

    const stats = await calculateStats(finalFiles, startTime, false);
    const totalTime = timeEnd('file-scan');

    logScanEnd(stats, totalTime);
    progress('complete', finalFiles.length);

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

// ==============================================================================
// TSCONFIG SUPPORT (SCANNER-002)
// ==============================================================================

/**
 * Parsed tsconfig patterns — only the fields relevant to file discovery.
 */
interface TsConfigPatterns {
    readonly include: ReadonlyArray<string>;
    readonly exclude: ReadonlyArray<string>;
}

/**
 * Attempts to read a tsconfig.json and extract `include` / `exclude` arrays.
 *
 * TypeScript config files allow JSON with comments and trailing commas, so
 * we strip single-line and block comments before parsing. If the file cannot
 * be read or parsed, we return null and the scan continues without tsconfig
 * narrowing (fail-open behaviour).
 *
 * @param tsConfigPath - Absolute or relative path to tsconfig.json
 * @param rootDir      - Scan root, used to convert absolute tsconfig paths to
 *                       root-relative globs for minimatch compatibility.
 * @returns Parsed patterns or null on error.
 */
async function loadTsConfigPatterns(
    tsConfigPath: string,
    rootDir: string
): Promise<TsConfigPatterns | null> {
    try {
        const raw = await readFile(tsConfigPath, 'utf-8');

        // Strip single-line and block comments (TypeScript JSON allows them).
        const stripped = raw
            .replace(/\/\/[^\n]*/g, '')
            .replace(/\/\*[\s\S]*?\*\//g, '');

        const config = JSON.parse(stripped) as {
            include?: string[];
            exclude?: string[];
            files?: string[];
        };

        const configDir = path.dirname(path.resolve(tsConfigPath));

        // Convert tsconfig-relative globs to rootDir-relative globs.
        const toRootRelative = (p: string): string => {
            const abs = path.resolve(configDir, p);
            const rel = path.relative(rootDir, abs).replace(/\\/g, '/');
            return rel;
        };

        const include: string[] = [];
        const exclude: string[] = [];

        if (Array.isArray(config.include)) {
            include.push(...config.include.map(toRootRelative));
        }
        // tsconfig `files` lists are treated as additional include patterns.
        if (Array.isArray(config.files)) {
            include.push(...config.files.map(toRootRelative));
        }
        if (Array.isArray(config.exclude)) {
            exclude.push(...config.exclude.map(toRootRelative));
        }

        return { include, exclude };
    } catch (err) {
        debug('scanner', `Failed to load tsconfig patterns from ${tsConfigPath}: ${err instanceof Error ? err.message : String(err)}`);
        return null;
    }
}

/**
 * Merges tsconfig-derived include/exclude patterns into the existing
 * `ExpandedPatterns` object.
 *
 * If the tsconfig provides `include` patterns they are added as additional
 * include globs (union semantics). If it provides `exclude` patterns they
 * are added to the ignore list.
 *
 * @param patterns    - Existing expanded patterns from normalizeOptions.
 * @param tsPatterns  - Patterns loaded from the tsconfig.
 * @returns New ExpandedPatterns with tsconfig patterns merged in.
 */
function mergeTsConfigPatterns(
    patterns: ExpandedPatterns,
    tsPatterns: TsConfigPatterns
): ExpandedPatterns {
    return {
        include: tsPatterns.include.length > 0
            ? [...patterns.include, ...tsPatterns.include]
            : patterns.include,
        ignore: tsPatterns.exclude.length > 0
            ? [...patterns.ignore, ...tsPatterns.exclude]
            : patterns.ignore,
    };
}
