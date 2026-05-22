/**
 * @fileoverview
 * Backfills source-file line/column coordinates onto config issues.
 *
 * After schema and semantic checks finish, every `ConfigIssue` has at most a
 * `path` (dotted-key location inside the config object). The enricher parses
 * the on-disk config file once and translates each `path` into precise
 * line/column data so reporters can produce IDE-clickable diagnostics.
 *
 * Uses the `AstCache` to avoid re-parsing unchanged files across runs.
 */

import crypto from 'node:crypto';
import type { AstCache } from '@ngcompass/cache';
import { ASTUtils, CACHE_VERSION } from '@ngcompass/common';
import type { ConfigIssue, LocationMap } from '@ngcompass/common';
import type { WritableIssue } from './types.js';

/**
 * Derives a version-namespaced cache key from a file's content hash.
 *
 * @param contentHash - SHA-1 hex digest of the file content.
 * @returns A versioned key of the form `v<CACHE_VERSION>:<hash>`.
 */
function buildVersionedCacheKey(contentHash: string): string {
    return `v${CACHE_VERSION}:${contentHash}`;
}

/** Computes the SHA-1 hex digest of `fileContent`. */
function computeContentHash(fileContent: string): string {
    return crypto.createHash('sha1').update(fileContent).digest('hex');
}

/** Parses `fileContent` and derives a path-keyed location map. */
function buildLocationMap(fileContent: string, filePath: string): LocationMap {
    const sourceFile = ASTUtils.parse(fileContent, filePath);
    return ASTUtils.generateLocationMap(sourceFile);
}

/**
 * Runtime check that the cached payload looks like a `LocationMap`.
 *
 * The cache stores `unknown`. Rather than blind-casting, verify the shape so a
 * corrupted entry produces a re-parse rather than a runtime crash deep inside
 * issue enrichment.
 */
function isLocationMap(value: unknown): value is LocationMap {
    if (!value || typeof value !== 'object') return false;
    // LocationMap values are { line, column } objects; sample any one entry.
    for (const v of Object.values(value as Record<string, unknown>)) {
        return Boolean(v && typeof v === 'object' && 'line' in v && 'column' in v);
    }
    return true; // empty object is a valid (degenerate) LocationMap
}

/**
 * Resolves a `LocationMap` from the cache when possible; otherwise parses
 * the file and writes the result back.
 *
 * @param fileContent  - Raw source text.
 * @param filePath     - Absolute path — used by the parser for source-map context.
 * @param astCache     - Optional two-tier (L1/L2) AST cache.
 * @param contentHash  - Pre-computed SHA-1 hex digest of `fileContent`.
 */
async function resolveLocationMap(
    fileContent: string,
    filePath: string,
    astCache: AstCache | undefined,
    contentHash: string,
): Promise<LocationMap> {
    if (!astCache) return buildLocationMap(fileContent, filePath);

    const versionedKey = buildVersionedCacheKey(contentHash);
    const cachedEntry = await astCache.get(versionedKey);

    if (cachedEntry && isLocationMap(cachedEntry.ast)) {
        return cachedEntry.ast;
    }

    const locationMap = buildLocationMap(fileContent, filePath);
    await astCache.set(versionedKey, { filePath, ast: locationMap });
    return locationMap;
}

/**
 * Applies precise line/column data from `locationMap` to issues that still
 * sit at their default position.
 *
 * Mutates `issues` in place: callers hand over array ownership and receive
 * the enriched objects through the same reference.
 */
function applyLocationsToIssues(
    issues: ConfigIssue[],
    locationMap: LocationMap,
    filePath: string,
): void {
    for (const issue of issues as WritableIssue[]) {
        if (!issue.file) issue.file = filePath;

        const isAtDefaultPosition = (!issue.line || issue.line === 1) && Boolean(issue.path);
        if (!isAtDefaultPosition) continue;

        const pathKey = issue.path!.join('.');
        const location = locationMap[pathKey];

        if (location) {
            issue.line = location.line;
            issue.column = location.column;
        }
    }
}

/**
 * Enriches `issues` with source-file line/column coordinates derived from an
 * AST parse of `fileContent`.
 *
 * @param issues       - Mutable array of config issues to enrich.
 * @param fileContent  - Raw source text of the config file.
 * @param filePath     - Absolute path to the config file.
 * @param astCache     - Optional two-tier (L1 memory / L2 disk) AST cache.
 * @param contentHash  - Optional pre-computed SHA-1 hex digest of `fileContent`.
 */
export async function enrichIssueLocations(
    issues: ConfigIssue[],
    fileContent: string,
    filePath: string,
    astCache?: AstCache,
    contentHash?: string,
): Promise<void> {
    if (issues.length === 0) return;

    const hash = contentHash ?? computeContentHash(fileContent);
    const locationMap = await resolveLocationMap(fileContent, filePath, astCache, hash);

    applyLocationsToIssues(issues, locationMap, filePath);
}
