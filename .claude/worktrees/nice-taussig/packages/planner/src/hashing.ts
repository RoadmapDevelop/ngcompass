/**
 * Content Hashing
 *
 * Deterministic hashing utilities for cache invalidation.
 * Hash inputs may include: file content, related resources, and active rules.
 */

import * as fs from "node:fs/promises";
import { debug, ResolvedRule } from "@ngcompass/common";
import { CacheKeyContext, computeHash, MetaCache } from "@ngcompass/cache";

import type { TaskInputs } from "./types.js";




/**
 * Warms up the in-memory hash cache using persistent metadata (stat-first hashing).
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
    const batchSize = 500;

    for (let i = 0; i < filePaths.length; i += batchSize) {
        const batch = filePaths.slice(i, i + batchSize);

        await Promise.all(
            batch.map(async (filePath) => {
                if (hashCache.has(filePath)) return;

                try {
                    const stats = await fs.stat(filePath);
                    const mtime = stats.mtimeMs;
                    const size = stats.size;

                    const cachedMeta = await metaCache.get(filePath);

                    if (cachedMeta && cachedMeta.mtime === mtime && cachedMeta.size === size) {
                        hashCache.set(filePath, cachedMeta.hash);
                        return;
                    }

                    const hash = await hashFile(filePath);
                    hashCache.set(filePath, hash);
                    await metaCache.set(filePath, { mtime, size, hash });
                } catch {
                    return;
                }
            })
        );
    }

    if (metaCache.flush) {
        await metaCache.flush();
    }
};

/**
 * Reads file content and returns a content hash.
 *
 * @param filePath - File path
 * @param cache - Optional in-memory cache
 * @returns Content hash
 */
export const hashFile = async (filePath: string, cache?: Map<string, string>): Promise<string> => {
    const cached = cache?.get(filePath);
    if (cached) return cached;

    try {
        const content = await fs.readFile(filePath, "utf-8");
        const hash = computeHash(content);
        cache?.set(filePath, hash);
        return hash;
    } catch (error) {
        debug(
            "planner",
            `Failed to hash file: ${filePath}. Error: ${error instanceof Error ? error.message : String(error)}`
        );
        return "";
    }
};

/**
 * Alias for hashFile to maintain compatibility.
 */
export const hashFileInput = hashFile;

/**
 * Calculates a combined hash for multiple files.
 *
 * @param filePaths - Array of file paths
 * @param cache - Optional hash cache
 * @returns Combined hash
 */
export const hashFiles = async (
    filePaths: ReadonlyArray<string>,
    cache?: Map<string, string>
): Promise<string> => {
    if (filePaths.length === 0) return "";

    const entries = await Promise.all(
        filePaths.map(async (p) => `${p}:${await hashFile(p, cache)}`)
    );

    entries.sort();
    return computeHash(entries.join("|"));
};

/**
 * Produces a stable JSON representation by sorting object keys recursively.
 *
 * @param value - Serializable value
 * @returns Stable JSON string
 */
const stableStringify = (value: unknown): string => {
    const seen = new WeakSet<object>();

    const normalize = (v: any): any => {
        if (v && typeof v === "object") {
            if (seen.has(v)) return "[Circular]";
            seen.add(v);

            if (Array.isArray(v)) return v.map(normalize);

            const out: Record<string, any> = {};
            for (const k of Object.keys(v).sort()) out[k] = normalize(v[k]);
            return out;
        }
        return v;
    };

    return JSON.stringify(normalize(value));
};

/**
 * Calculates hash for rules configuration.
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
        .sort((a, b) => a.name.localeCompare(b.name));

    return computeHash(stableStringify(rulesData));
};

/**
 * Calculates combined hash for a file and its resources.
 *
 * @param inputs - Task inputs with hashes
 * @param applicableRules - Rules that apply to this file
 * @returns Combined content hash
 */
export const calculateFileHash = (
    inputs: TaskInputs,
    applicableRules: ReadonlyArray<ResolvedRule>
): string => {
    const parts: string[] = [];

    parts.push(inputs.typescript.hash);

    if (inputs.template) parts.push(inputs.template.hash);

    if (inputs.styles) {
        const styleHashes = inputs.styles.map((s) => s.hash).sort();
        parts.push(...styleHashes);
    }

    if (inputs.spec) parts.push(inputs.spec.hash);

    parts.push(hashRules(applicableRules));

    return computeHash(parts.join("::"));
};

/**
 * Calculates hash for task inputs only (no rules).
 *
 * @param inputs - Task inputs
 * @returns Inputs hash
 */
export const hashTaskInputs = async (inputs: TaskInputs): Promise<string> => {
    const filePaths: string[] = [inputs.typescript.path];

    if (inputs.template) filePaths.push(inputs.template.path);
    if (inputs.styles) filePaths.push(...inputs.styles.map((s) => s.path));
    if (inputs.spec) filePaths.push(inputs.spec.path);

    return hashFiles(filePaths);
};

/**
 * Fast hash using only file stats.
 *
 * @param filePath - File path
 * @returns Stats-based hash
 */
export const hashFileStats = async (filePath: string): Promise<string> => {
    try {
        const stats = await fs.stat(filePath);
        return computeHash(`${filePath}::${stats.size}::${stats.mtimeMs}`);
    } catch {
        return "";
    }
};

/**
 * Calculates content-based task ID for task-centric caching.
 *
 * When a CacheKeyContext is provided the toolVersion and ruleRegistryHash are
 * prepended to the hash inputs. This is CRITICAL: without them, upgrading the
 * tool or a plugin would leave stale per-task results in the result cache even
 * though the plan cache correctly misses (globalHash changes).
 *
 * @param ruleName - Rule name
 * @param inputs - Task inputs with hashes
 * @param options - Rule options
 * @param ctx - Optional version context (strongly recommended; omitting risks stale results)
 * @returns Content-based task ID
 */
export const calculateTaskId = (
    ruleName: string,
    inputs: TaskInputs,
    options: Readonly<Record<string, unknown>>,
    ctx?: CacheKeyContext
): string => {
    const parts: string[] = [];

    // Version scope — ensures result cache is isolated per engine + rule-set version
    if (ctx) {
        parts.push(ctx.toolVersion);
        parts.push(ctx.ruleRegistryHash);
    }

    parts.push(ruleName);
    parts.push(inputs.typescript.path);
    parts.push(inputs.typescript.hash);

    if (inputs.template) parts.push(inputs.template.hash);

    if (inputs.styles?.length) {
        const stylesHash = inputs.styles.map((s) => s.hash).sort().join("::");
        parts.push(stylesHash);
    }

    if (inputs.spec) parts.push(inputs.spec.hash);

    parts.push(stableStringify(options));

    return computeHash(parts.join("::"));
};

/**
 * Calculates a global hash for the entire project state.
 *
 * When a CacheKeyContext is provided the version information is appended to
 * the hash inputs so that tool upgrades, parser upgrades, and rule-set changes
 * all produce a new globalHash — causing the plan cache and analysis cache to
 * miss and rebuild correctly.
 *
 * @param files - All discovered files
 * @param rules - All resolved rules
 * @param hashCache - Current hash cache
 * @param ctx - Optional version context (strongly recommended)
 * @returns Global state hash
 */
export const calculateGlobalHash = async (
    files: ReadonlyArray<string>,
    rules: ReadonlyMap<string, ResolvedRule>,
    hashCache: Map<string, string>,
    ctx?: CacheKeyContext
): Promise<string> => {
    const fileEntries = await Promise.all(
        files.map(async (f) => `${f}:${hashCache.get(f) ?? (await hashFile(f, hashCache))}`)
    );

    fileEntries.sort();

    const parts: string[] = [];
    parts.push(...fileEntries);
    parts.push(hashRules(Array.from(rules.values())));

    // Append version context so that tool/parser/rule-set changes invalidate
    // the plan cache and analysis cache even when file content is unchanged.
    if (ctx) {
        parts.push(`tool:${ctx.toolVersion}`);
        parts.push(`parser:${ctx.parserVersion}`);
        parts.push(`registry:${ctx.ruleRegistryHash}`);
        parts.push(`platform:${ctx.platform}`);
    }

    return computeHash(parts.join("||"));
};

