/**
 * @fileoverview
 * Content hashing helpers used by the planner.
 *
 * Three families of helpers live here:
 *  - File-content hashing (`hashFile`, `hashFiles`, `hashFileStats`).
 *  - Rule-set hashing (`hashRules`).
 *  - Cache-key derivation (`calculateFileHash`, `calculateTaskId`,
 *    `calculateGlobalHash`).
 *
 * Stable serialization is delegated to `@ngcompass/common`'s `stableSerialize`
 * so cache keys derived here are byte-compatible with cache keys derived in
 * any other package.
 */

import * as fs from 'node:fs/promises';
import { debug, stableSerialize, type ResolvedRule } from '@ngcompass/common';
import { computeHash, type CacheKeyContext, type MetaCache } from '@ngcompass/cache';

import type { TaskInputs } from './types.js';

/** Concurrency limit for file-batched hashing. Tuned for typical OS fd limits. */
const HASH_BATCH_SIZE = 500;

// ── Cache warmup ──────────────────────────────────────────────────────────

/**
 * Warms `hashCache` from `metaCache` using a stat-first strategy. Files whose
 * mtime/size match the persisted meta entry skip re-hashing; everything else
 * is hashed from disk and the meta entry refreshed.
 */
export const warmupHashCache = async (
    filePaths: string[],
    metaCache: MetaCache,
    hashCache: Map<string, string>,
): Promise<void> => {
    for (let i = 0; i < filePaths.length; i += HASH_BATCH_SIZE) {
        const batch = filePaths.slice(i, i + HASH_BATCH_SIZE);

        await Promise.all(
            batch.map(async (filePath) => {
                if (hashCache.has(filePath)) return;
                try {
                    const stats = await fs.stat(filePath);
                    const cachedMeta = await metaCache.get(filePath);
                    if (cachedMeta && cachedMeta.mtime === stats.mtimeMs && cachedMeta.size === stats.size) {
                        hashCache.set(filePath, cachedMeta.hash);
                        return;
                    }
                    const hash = await hashFile(filePath);
                    hashCache.set(filePath, hash);
                    await metaCache.set(filePath, { mtime: stats.mtimeMs, size: stats.size, hash });
                } catch {
                    // Stat or read failure: skip warmup. Will be re-attempted
                    // when hashFile is invoked directly during plan building.
                }
            }),
        );
    }

    if (metaCache.flush) await metaCache.flush();
};

// ── File hashing ──────────────────────────────────────────────────────────

/**
 * Reads `filePath` and returns the content hash. On read error returns `""`
 * (and logs a debug line). The empty-hash sentinel is significant: cache keys
 * that incorporate it collapse to the same bucket, so a file that consistently
 * fails to read will look identical to every other failed file — an
 * acceptable trade-off in practice because such files are not analyzed and
 * the cache miss simply recurs on subsequent runs.
 */
export const hashFile = async (
    filePath: string,
    cache?: Map<string, string>,
): Promise<string> => {
    const cached = cache?.get(filePath);
    if (cached) return cached;

    try {
        const content = await fs.readFile(filePath, 'utf-8');
        const hash = computeHash(content);
        cache?.set(filePath, hash);
        return hash;
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        debug('planner', `Failed to hash file: ${filePath}. Error: ${message}`);
        return '';
    }
};

/**
 * Hashes a list of files and combines the results into a single stable hash.
 * Entries are sorted before combination so input order is irrelevant.
 */
export const hashFiles = async (
    filePaths: ReadonlyArray<string>,
    cache?: Map<string, string>,
): Promise<string> => {
    if (filePaths.length === 0) return '';
    const entries = await Promise.all(
        filePaths.map(async (p) => `${p}:${await hashFile(p, cache)}`),
    );
    entries.sort();
    return computeHash(entries.join('|'));
};

/** Fast stats-based hash (no read). Useful when content-equality is not required. */
export const hashFileStats = async (filePath: string): Promise<string> => {
    try {
        const stats = await fs.stat(filePath);
        return computeHash(`${filePath}::${stats.size}::${stats.mtimeMs}`);
    } catch {
        return '';
    }
};

// ── Rule + task hashing ───────────────────────────────────────────────────

/**
 * Hashes the rule set, including each rule's name, severity, and options.
 * Rule names are ASCII-only, so default sort is sufficient (avoids the cost
 * of `localeCompare`).
 */
export const hashRules = (rules: ReadonlyArray<ResolvedRule>): string => {
    const rulesData = rules
        .map((rule) => ({ name: rule.name, severity: rule.severity, options: rule.options }))
        .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    return computeHash(stableSerialize(rulesData));
};

/**
 * Computes a combined hash of a file's task inputs plus the rules that apply
 * to that file.
 */
export const calculateFileHash = (
    inputs: TaskInputs,
    applicableRules: ReadonlyArray<ResolvedRule>,
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
    return computeHash(parts.join('::'));
};

/** Hashes only the input files (no rules). */
export const hashTaskInputs = async (inputs: TaskInputs): Promise<string> => {
    const filePaths: string[] = [inputs.typescript.path];
    if (inputs.template) filePaths.push(inputs.template.path);
    if (inputs.styles) filePaths.push(...inputs.styles.map((s) => s.path));
    if (inputs.spec) filePaths.push(inputs.spec.path);
    return hashFiles(filePaths);
};

/**
 * Computes a content-based task identifier used as the result-cache key.
 *
 * When `ctx` is supplied the tool version and rule-registry hash are mixed
 * into the digest so an upgrade of either invalidates per-task cache entries
 * automatically. Omitting `ctx` is allowed only for tests — production paths
 * always pass it.
 */
export const calculateTaskId = (
    ruleName: string,
    inputs: TaskInputs,
    options: Readonly<Record<string, unknown>>,
    ctx?: CacheKeyContext,
): string => {
    const parts: string[] = [];
    if (ctx) {
        parts.push(ctx.toolVersion);
        parts.push(ctx.ruleRegistryHash);
    }
    parts.push(ruleName);
    parts.push(inputs.typescript.path);
    parts.push(inputs.typescript.hash);
    if (inputs.template) parts.push(inputs.template.hash);
    if (inputs.styles?.length) {
        parts.push(inputs.styles.map((s) => s.hash).sort().join('::'));
    }
    if (inputs.spec) parts.push(inputs.spec.hash);
    parts.push(stableSerialize(options));
    return computeHash(parts.join('::'));
};

/**
 * Computes the global hash for the whole project state.
 *
 * Combines:
 *  - sorted (file path : content hash) pairs for every file
 *  - the rule-set hash
 *  - the version context (tool / parser / rule registry / platform)
 *
 * Used as the plan-cache and analysis-cache key.
 */
export const calculateGlobalHash = async (
    files: ReadonlyArray<string>,
    rules: ReadonlyMap<string, ResolvedRule>,
    hashCache: Map<string, string>,
    ctx?: CacheKeyContext,
): Promise<string> => {
    const fileEntries: string[] = [];
    for (let i = 0; i < files.length; i += HASH_BATCH_SIZE) {
        const batch = files.slice(i, i + HASH_BATCH_SIZE);
        const batchEntries = await Promise.all(
            batch.map(async (f) => `${f}:${hashCache.get(f) ?? (await hashFile(f, hashCache))}`),
        );
        fileEntries.push(...batchEntries);
    }
    fileEntries.sort();

    const parts: string[] = [];
    parts.push(...fileEntries);
    parts.push(hashRules(Array.from(rules.values())));

    if (ctx) {
        parts.push(`tool:${ctx.toolVersion}`);
        parts.push(`parser:${ctx.parserVersion}`);
        parts.push(`registry:${ctx.ruleRegistryHash}`);
        parts.push(`platform:${ctx.platform}`);
    }

    return computeHash(parts.join('||'));
};
