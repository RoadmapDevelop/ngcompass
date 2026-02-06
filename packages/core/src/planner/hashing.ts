/**
 * Content Hashing
 *
 * Pure functions for calculating content hashes for cache invalidation.
 * Hash includes: file content + related resources + active rules
 */

import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import xxhash from 'xxhash-wasm';
import type { TaskInputs } from './types.js';
import type { ResolvedRule } from '../rules/types.js';
import type { MetaCache } from '../cache/index.js';

let h64: ((input: string) => string) | undefined;

/**
 * Initializes the xxhash hasher.
 */
export const initHasher = async (): Promise<void> => {
    if (h64) return;
    const { h64: hasher } = await xxhash();
    h64 = (input: string) => hasher(input).toString(16);
};

/**
 * Computes a fast hash of a string using xxhash if initialized,
 * falling back to SHA-256 otherwise.
 *
 * @param content - Content to hash
 * @returns Hex-encoded hash
 */
export const computeHash = (content: string): string => {
    if (h64) {
        return h64(content);
    }
    // Fallback for safety, though we should always initialize
    return crypto.createHash('sha256').update(content).digest('hex');
};

/**
 * Warms up the in-memory hash cache using persistent metadata (Stat-First Hashing).
 * Parallelizes stat() and metaCache.get() to minimize I/O overhead.
 *
 * @param filePaths - Files to warm up
 * @param metaCache - Persistent meta cache
 * @param hashCache - In-memory hash cache to populate
 */
export const warmupHashCache = async (
    filePaths: string[],
    metaCache: MetaCache,
    hashCache: Map<string, string>
): Promise<void> => {
    // Use a pool to avoid overwhelming the OS with thousands of stats at once
    const BATCH_SIZE = 50;
    for (let i = 0; i < filePaths.length; i += BATCH_SIZE) {
        const batch = filePaths.slice(i, i + BATCH_SIZE);
        await Promise.all(
            batch.map(async (filePath) => {
                if (hashCache.has(filePath)) return;

                try {
                    // 1. Get file stats
                    const stats = await stat(filePath);
                    const mtime = stats.mtimeMs;
                    const size = stats.size;

                    // 2. Check persistent cache
                    const cachedMeta = await metaCache.get(filePath);

                    if (cachedMeta && cachedMeta.mtime === mtime && cachedMeta.size === size) {
                        // HIT: Reuse cached hash without reading file
                        hashCache.set(filePath, cachedMeta.hash);
                    } else {
                        // MISS: Read, hash, and update persistent cache
                        const content = readFileSafe(filePath);
                        const hash = computeHash(content);

                        hashCache.set(filePath, hash);
                        await metaCache.set(filePath, { mtime, size, hash });
                    }
                } catch (err) {
                    // Handle missing files by allowing them to be handled by normal pipeline
                }
            })
        );
    }
};

/**
 * Reads file content safely.
 *
 * @param filePath - File path
 * @returns File content or empty string if error
 */
const readFileSafe = (filePath: string): string => {
    try {
        return readFileSync(filePath, 'utf-8');
    } catch {
        return '';
    }
};

/**
 * Calculates hash for a single file.
 *
 * @param filePath - File path
 * @param cache - Optional hash cache
 * @returns Content hash
 */
export const hashFile = (filePath: string, cache?: Map<string, string>): string => {
    if (cache?.has(filePath)) {
        return cache.get(filePath)!;
    }

    const content = readFileSafe(filePath);
    const hash = computeHash(content);

    if (cache) {
        cache.set(filePath, hash);
    }

    return hash;
};

/**
 * Calculates hash for multiple files combined.
 *
 * @param filePaths - Array of file paths
 * @param cache - Optional hash cache
 * @returns Combined hash
 */
export const hashFiles = (
    filePaths: ReadonlyArray<string>,
    cache?: Map<string, string>
): string => {
    const combinedContent = filePaths
        .map((path) => {
            if (cache?.has(path)) {
                // We can't use the hash here directly as we need the content for combined hash
                // BUT we can cache the result of this entire combined hash if we wanted.
                // For now, let's just use the cached content if we had a content cache.
                // However, the bottleneck is SHA-256 on the same files.
                return readFileSafe(path);
            }
            return readFileSafe(path);
        })
        .join('\n---FILE-BOUNDARY---\n');
    return computeHash(combinedContent);
};

/**
 * Calculates hash for rules configuration.
 * Includes rule names, severities, and options.
 *
 * @param rules - Rules that apply to this file
 * @returns Rules hash
 */
export const hashRules = (rules: ReadonlyArray<ResolvedRule>): string => {
    const rulesData = rules
        .map((rule) => ({
            name: rule.name,
            severity: rule.severity,
            options: rule.options,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)); // Sort for determinism

    const rulesJson = JSON.stringify(rulesData);
    return computeHash(rulesJson);
};

/**
 * Calculates combined hash for a file and its resources using existing hashes.
 * Hash = hash(tsHash + templateHash + stylesHashes + specHash + rulesHash)
 *
 * This version is optimized for P2/P3 to reuse hashes already computed during
 * task building, effectively eliminating a second full pass of disk I/O.
 *
 * @param inputs - Task inputs (all resources with hashes)
 * @param applicableRules - Rules that apply to this file
 * @returns Combined content hash
 */
export const calculateFileHash = (
    inputs: TaskInputs,
    applicableRules: ReadonlyArray<ResolvedRule>
): string => {
    const parts: string[] = [];

    // Combine input hashes
    parts.push(inputs.typescript.hash);

    if (inputs.template) {
        parts.push(inputs.template.hash);
    }

    if (inputs.styles) {
        // Collect and sort style hashes for determinism
        const styleHashes = inputs.styles.map((s) => s.hash).sort();
        parts.push(...styleHashes);
    }

    if (inputs.spec) {
        parts.push(inputs.spec.hash);
    }

    // Hash rules configuration
    const rulesHash = hashRules(applicableRules);
    parts.push(rulesHash);

    // Combine all parts and hash
    return computeHash(parts.join('::'));
};

/**
 * Calculates hash for task inputs only (no rules).
 * Used for detecting if resources changed.
 *
 * @param inputs - Task inputs
 * @returns Inputs hash
 */
export const hashTaskInputs = (inputs: TaskInputs): string => {
    const filePaths: string[] = [];

    filePaths.push(inputs.typescript.path);

    if (inputs.template) {
        filePaths.push(inputs.template.path);
    }

    if (inputs.styles) {
        filePaths.push(...inputs.styles.map((s) => s.path));
    }

    if (inputs.spec) {
        filePaths.push(inputs.spec.path);
    }

    return hashFiles(filePaths);
};

/**
 * Fast hash using only file stats (size + mtime).
 * Much faster than content hash but less accurate.
 *
 * @param filePath - File path
 * @returns Stats-based hash
 */
export const hashFileStats = (filePath: string): string => {
    try {
        const stats = readFileSync(filePath).length; // Just get size for now
        return computeHash(`${filePath}::${stats}`);
    } catch {
        return '';
    }
};

/**
 * Calculates hash for a single file input.
 * Returns empty string if file doesn't exist.
 *
 * @param filePath - File path
 * @param cache - Optional hash cache
 * @returns Content hash or empty string
 */
export const hashFileInput = (filePath: string, cache?: Map<string, string>): string => {
    return hashFile(filePath, cache);
};

/**
 * Calculates content-based task ID for task-centric caching.
 *
 * Task ID includes:
 * - Rule name
 * - All input file content hashes
 * - Rule options
 *
 * This enables:
 * - Cache hits even after file renames (content unchanged)
 * - Precise invalidation (only when relevant content changes)
 * - Cross-project cache sharing (same content = same ID)
 *
 * @param ruleName - Rule name
 * @param inputs - Task inputs with hashes
 * @param options - Rule options
 * @returns Content-based task ID (SHA-256)
 */
export const calculateTaskId = (
    ruleName: string,
    inputs: TaskInputs,
    options: Readonly<Record<string, unknown>>
): string => {
    const parts: string[] = [ruleName];

    // Add TypeScript hash (always present)
    parts.push(inputs.typescript.hash);

    // Add template hash (if present)
    if (inputs.template) {
        parts.push(inputs.template.hash);
    }

    // Add styles hashes (if present)
    if (inputs.styles && inputs.styles.length > 0) {
        const stylesHash = inputs.styles.map((s) => s.hash).join('::');
        parts.push(stylesHash);
    }

    // Add spec hash (if present)
    if (inputs.spec) {
        parts.push(inputs.spec.hash);
    }

    // Add options (stringified for determinism)
    parts.push(JSON.stringify(options));

    // Combine all parts and hash
    return computeHash(parts.join('::'));
};

/**
 * Calculates a global hash for the entire project state.
 * Used for caching the complete ExecutionPlanOutput.
 *
 * @param files - All discovered files
 * @param rules - All resolved rules
 * @param hashCache - Current hash cache
 * @returns Global state hash
 */
export const calculateGlobalHash = (
    files: ReadonlyArray<string>,
    rules: ReadonlyMap<string, ResolvedRule>,
    hashCache: Map<string, string>
): string => {
    const parts: string[] = [];

    // 1. Add all file paths and their content hashes (sorted for determinism)
    const fileHashes = files
        .map((f) => `${f}:${hashCache.get(f) || ''}`)
        .sort();
    parts.push(...fileHashes);

    // 2. Add rules hash
    parts.push(hashRules(Array.from(rules.values())));

    return computeHash(parts.join('||'));
};
