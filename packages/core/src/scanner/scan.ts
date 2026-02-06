/**
 * Main Scan Pipeline
 *
 * Composes pure functions into a complete file scanning pipeline.
 * Follows functional programming principles: pure functions, immutability, composition.
 */

import { debug, time, timeEnd } from '@ngcompass/common';
import type { ScanOptions, ScanResult, Result } from './types.js';
import { Ok } from './types.js';
import { normalizeOptions } from './normalize.js';
import { expandPatterns } from './patterns.js';
import { executeGlob } from './glob.js';
import { isGitRepo, executeGitDiscovery, getRepoFingerprint } from './git.js';
import { applyFilters, filterByGlob } from './filters.js';
import { calculateStats } from './stats.js';

/**
 * Scans for files matching the given options.
 *
 * Functional pipeline composition:
 * 1. Normalize options (pure)
 * 2. Expand patterns (pure)
 * 3. Execute glob (side effect - isolated)
 * 4. Apply filters (side effect - isolated)
 * 5. Calculate stats (pure)
 *
 * @param options - Scanner configuration
 * @returns Result containing scan results or error
 */
export const scan = async (options: ScanOptions): Promise<Result<ScanResult>> => {
    time('file-scan');
    const startTime = performance.now();
    const timings = {
        normalization: 0,
        discovery: 0,
        filtering: 0,
        total: 0
    };

    if (options.debug) {
        debug('scanner', `Starting file discovery in: ${options.rootDir}`);
        debug('scanner', `Include patterns: ${options.include.join(', ')}`);
        debug('scanner', `Exclude patterns: ${options.exclude.join(', ')}`);
    }

    // Step 1: Normalize options (pure function)
    const t0 = performance.now();
    const normalized = normalizeOptions(options);
    if (options.debug) debug('scanner', `Normalized rootDir: ${normalized.rootDir}`);

    // Step 2: Expand patterns (pure function)
    const patterns = expandPatterns(normalized);
    if (options.debug) debug('scanner', `Expanded to ${patterns.include.length} include patterns, ${patterns.ignore.length} ignore patterns`);

    timings.normalization = performance.now() - t0;

    // Early Git check for optimization & caching
    const isGit = await isGitRepo(normalized.rootDir);

    // Step 2.5: Cache Check (Milestone 1)
    let cacheKey = '';
    const tCacheStart = performance.now();

    if (options.cache && isGit) {
        const fingerprint = await getRepoFingerprint(normalized.rootDir);
        if (fingerprint) {
            // Include patterns in key to invalidate if config changes
            cacheKey = options.cache.computeHash([
                normalized.rootDir,
                JSON.stringify(patterns),
                fingerprint,
                'v1'
            ].join('|'));

            const cached = await options.cache.files.get(cacheKey);
            if (cached) {
                if (options.debug) debug('scanner', `Cache HIT. Loaded ${cached.files.length} files.`);

                const tCacheEnd = performance.now();
                timings.discovery = tCacheEnd - tCacheStart;
                timings.total = tCacheEnd - startTime;

                const stats = calculateStats(cached.files, startTime, true);

                return Ok({
                    files: cached.files,
                    stats,
                    timestamp: Date.now(),
                    timings: options.debug ? timings : undefined
                });
            }
        }
    }

    // Step 3: Execute discovery (Prefer Git-native for speed)
    const t1 = performance.now();
    let rawFiles: ReadonlyArray<string>;
    // const isGit = await isGitRepo(normalized.rootDir);

    if (isGit) {
        if (options.debug) debug('scanner', 'Git repository detected. Using fast Git discovery...');
        const gitFiles = await executeGitDiscovery(normalized.rootDir);

        // Filter Git results by the user's include/exclude patterns
        rawFiles = filterByGlob(
            gitFiles,
            patterns.include,
            patterns.ignore,
            normalized.rootDir
        ) as string[];

        if (options.debug) debug('scanner', `Git discovery found ${rawFiles.length} files (after glob filtering)`);
    } else {
        if (options.debug) debug('scanner', 'Not a Git repository. Falling back to standard globbing...');
        const rawResult = await executeGlob(patterns, normalized.rootDir, {
            followSymlinks: normalized.followSymlinks,
        });

        if (!rawResult.ok) {
            const scanTime = timeEnd('file-scan');
            if (options.debug) debug('scanner', `Scan failed after ${scanTime.toFixed(1)}ms: ${rawResult.error.message}`);
            return rawResult;
        }
        rawFiles = rawResult.data.files;
        if (options.debug) debug('scanner', `Glob found ${rawFiles.length} files`);
    }

    timings.discovery = performance.now() - t1;

    // Step 4: Apply filters (side effect isolated in gitignore loading)
    const t2 = performance.now();
    const filteredResult = await applyFilters({ files: rawFiles }, normalized);

    if (!filteredResult.ok) {
        const scanTime = timeEnd('file-scan');
        if (options.debug) debug('scanner', `Filter failed after ${scanTime.toFixed(1)}ms: ${filteredResult.error.message}`);
        return filteredResult;
    }

    timings.filtering = performance.now() - t2;

    if (options.debug) debug('scanner', `After filters: ${filteredResult.data.files.length} files (${filteredResult.data.filtered} filtered out)`);

    // Cache Save
    if (options.cache && cacheKey && filteredResult.data.files.length > 0) {
        await options.cache.files.set(cacheKey, filteredResult.data.files as string[]);
        if (options.debug) debug('scanner', 'File list cached.');
    }

    // Step 5: Calculate stats (pure function)
    const stats = calculateStats(filteredResult.data.files, startTime, false);

    const scanTime = timeEnd('file-scan');
    timings.total = scanTime;

    if (options.debug) {
        debug('scanner', `Scan complete: ${stats.totalFiles} files in ${scanTime.toFixed(1)}ms`);
        debug('scanner', `Breakdown: ${formatExtensionBreakdown(stats.byExtension)}`);
    }

    // Warn if no files found
    if (stats.totalFiles === 0 && options.debug) {
        debug('scanner', '⚠️  No files found matching patterns. Check your include/exclude configuration.');
    }

    // Return result (immutable)
    return Ok({
        files: filteredResult.data.files,
        stats,
        timestamp: Date.now(),
        timings: options.debug ? timings : undefined
    });
};

/**
 * Helper to format extension breakdown for debug output.
 *
 * Pure function.
 */
const formatExtensionBreakdown = (byExtension: ReadonlyMap<string, number>): string => {
    const entries = Array.from(byExtension.entries())
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5); // Show top 5

    return entries.map(([ext, count]) => `${ext}:${count}`).join(', ');
};
