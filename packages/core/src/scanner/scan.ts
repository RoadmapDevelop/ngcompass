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
import { applyFilters } from './filters.js';
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

    debug('scanner', `Starting file discovery in: ${options.rootDir}`);
    debug('scanner', `Include patterns: ${options.include.join(', ')}`);
    debug('scanner', `Exclude patterns: ${options.exclude.join(', ')}`);

    // Step 1: Normalize options (pure function)
    const normalized = normalizeOptions(options);
    debug('scanner', `Normalized rootDir: ${normalized.rootDir}`);

    // Step 2: Expand patterns (pure function)
    const patterns = expandPatterns(normalized);
    debug('scanner', `Expanded to ${patterns.include.length} include patterns, ${patterns.ignore.length} ignore patterns`);

    // Step 3: Execute glob (side effect isolated)
    const rawResult = await executeGlob(patterns, normalized.rootDir, {
        followSymlinks: normalized.followSymlinks
    });

    if (!rawResult.ok) {
        const scanTime = timeEnd('file-scan');
        debug('scanner', `Scan failed after ${scanTime.toFixed(1)}ms: ${rawResult.error.message}`);
        return rawResult;
    }

    debug('scanner', `Glob found ${rawResult.data.files.length} files`);

    // Step 4: Apply filters (side effect isolated in gitignore loading)
    const filteredResult = await applyFilters(rawResult.data, normalized);

    if (!filteredResult.ok) {
        const scanTime = timeEnd('file-scan');
        debug('scanner', `Filter failed after ${scanTime.toFixed(1)}ms: ${filteredResult.error.message}`);
        return filteredResult;
    }

    debug('scanner', `After filters: ${filteredResult.data.files.length} files (${filteredResult.data.filtered} filtered out)`);

    // Step 5: Calculate stats (pure function)
    const stats = calculateStats(filteredResult.data.files, startTime, false);

    const scanTime = timeEnd('file-scan');
    debug('scanner', `Scan complete: ${stats.totalFiles} files in ${scanTime.toFixed(1)}ms`);
    debug('scanner', `Breakdown: ${formatExtensionBreakdown(stats.byExtension)}`);

    // Warn if no files found
    if (stats.totalFiles === 0) {
        debug('scanner', '⚠️  No files found matching patterns. Check your include/exclude configuration.');
    }

    // Return result (immutable)
    return Ok({
        files: filteredResult.data.files,
        stats,
        timestamp: Date.now()
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
