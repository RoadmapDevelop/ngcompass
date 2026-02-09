/**
 * Content Hashing
 *
 * Pure functions for calculating content hashes for cache invalidation.
 * Hash includes: file content + related resources + active rules
 */

import crypto from 'node:crypto';
import * as fs from 'node:fs/promises';
import xxhash from 'xxhash-wasm';
import type { TaskInputs } from './types.js';
import type { ResolvedRule } from '../rules/types.js';
import type { MetaCache } from '../cache/index.js';

let h64: ((input: string | Uint8Array) => string) | undefined;

/**
 * Initializes the xxhash hasher.
 */
export const initHasher = async (): Promise<void> => {
    if (h64) return;
    const { h64: hasher } = await xxhash();
    h64 = (input: string | Uint8Array) => hasher(input as any).toString(16);
};

/**
 * Computes a fast hash of a string or buffer using xxhash if initialized,
 * falling back to SHA-256 otherwise.
 *
 * @param content - Content to hash
 * @returns Hex-encoded hash
 */
export const computeHash = (content: string | Uint8Array): string => {
    if (h64) {
        return h64(content);
    }
    // Fallback for safety, though we should always initialize
    const hasher = crypto.createHash('sha256');
    hasher.update(content);
    return hasher.digest('hex');
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
                    const stats = await fs.stat(filePath);
                    const mtime = stats.mtimeMs;
                    const size = stats.size;

                    // 2. Check persistent cache
                    const cachedMeta = await metaCache.get(filePath);

                    if (cachedMeta && cachedMeta.mtime === mtime && cachedMeta.size === size) {
                        // HIT: Reuse cached hash without reading file
                        hashCache.set(filePath, cachedMeta.hash);
                    } else {
                        // MISS: Read, hash, and update persistent cache
                        const hash = await hashFile(filePath);
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
 * Reads file content safely and returns hash.
 *
 * @param filePath - File path
 * @returns Hash of file content
 */
export const hashFile = async (filePath: string, cache?: Map<string, string>): Promise<string> => {
    if (cache?.has(filePath)) {
        return cache.get(filePath)!;
    }

    try {
        const content = await fs.readFile(filePath, 'utf-8');
        const hash = computeHash(content);
        if (cache) {
            cache.set(filePath, hash);
        }
        return hash;
    } catch {
        return '';
    }
};

/**
 * Alias for hashFile to maintain compatibility.
 */
export const hashFileInput = hashFile;

/**
 * Calculates hash for multiple files combined.
 * OPTIMIZED: Instead of joining full contents, hashes each file and then joins hashes.
 *
 * @param filePaths - Array of file paths
 * @param cache - Optional hash cache
 * @returns Combined hash
 */
export const hashFiles = async (
    filePaths: ReadonlyArray<string>,
    cache?: Map<string, string>
): Promise<string> => {
    if (filePaths.length === 0) return '';

    // Hash each file in parallel
    const hashes = await Promise.all(filePaths.map(p => hashFile(p, cache)));

    // Join hashes for combined hash (minimal memory usage)
    return computeHash(hashes.join('|'));
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
export const hashTaskInputs = async (inputs: TaskInputs): Promise<string> => {
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
export const hashFileStats = async (filePath: string): Promise<string> => {
    try {
        const stats = await fs.stat(filePath);
        return computeHash(`${filePath}::${stats.size}::${stats.mtimeMs}`);
    } catch {
        return '';
    }
};

/**
 * Calculates content-based task ID for task-centric caching.
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

    // Add TypeScript path and hash (path for rule context, hash for content)
    parts.push(inputs.typescript.path);
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
export const calculateGlobalHash = async (
    files: ReadonlyArray<string>,
    rules: ReadonlyMap<string, ResolvedRule>,
    hashCache: Map<string, string>
): Promise<string> => {
    const parts: string[] = [];

    // 1. Add all file paths and their content hashes (sorted for determinism)
    // Map in parallel to avoid sequential disk I/O
    const fileHashes = await Promise.all(files.map(async (f) => {
        const hash = hashCache.get(f) || await hashFile(f, hashCache);
        return `${f}:${hash}`;
    }));

    fileHashes.sort();
    parts.push(...fileHashes);

    // 2. Add rules hash
    parts.push(hashRules(Array.from(rules.values())));

    return computeHash(parts.join('||'));
};
