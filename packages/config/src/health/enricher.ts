import { AstCache } from "@ngcompass/cache";
import { ConfigIssue, ASTUtils, LocationMap, CACHE_VERSION } from "@ngcompass/common";
import crypto from "node:crypto";

// ---------------------------------------------------------------------------
// Private helpers — each does exactly one thing
// ---------------------------------------------------------------------------

/**
 * Derives a stable, version-namespaced cache key from a file's content hash.
 *
 * @param contentHash - SHA-1 hex digest of the file content.
 * @returns A versioned key of the form `v<CACHE_VERSION>:<hash>`.
 */
function buildVersionedCacheKey(contentHash: string): string {
    return `v${CACHE_VERSION}:${contentHash}`;
}

/**
 * Computes the SHA-1 hex digest of `fileContent`.
 * Only called when the caller does not already supply a hash,
 * avoiding a redundant hash on hot paths where the hash was pre-computed.
 */
function computeContentHash(fileContent: string): string {
    return crypto.createHash("sha1").update(fileContent).digest("hex");
}

/**
 * Parses `fileContent` and derives a path-keyed location map.
 * Extracted to eliminate the duplicated parse+map pattern that existed
 * in both the cache-miss and no-cache branches of the original code.
 */
function buildLocationMap(fileContent: string, filePath: string): LocationMap {
    const sourceFile = ASTUtils.parse(fileContent, filePath);
    return ASTUtils.generateLocationMap(sourceFile);
}

/**
 * Resolves a `LocationMap` using the two-tiered AST cache when available,
 * falling back to a direct parse when the cache is absent.
 *
 * @param fileContent  - Raw source text.
 * @param filePath     - Absolute path — used by the parser for source-map context.
 * @param astCache     - Optional cache instance (L1/L2 strategy).
 * @param contentHash  - Pre-computed SHA-1 hex digest. Avoids re-hashing on callers
 *                       that already possess the hash (e.g. the engine's file scanner).
 * @returns A `LocationMap` keyed by dot-joined config path segments.
 */
async function resolveLocationMap(
    fileContent: string,
    filePath: string,
    astCache: AstCache | undefined,
    contentHash: string,
): Promise<LocationMap> {
    if (!astCache) {
        return buildLocationMap(fileContent, filePath);
    }

    const versionedKey = buildVersionedCacheKey(contentHash);
    const cachedEntry = await astCache.get(versionedKey);

    if (cachedEntry) {
        // The cache stores an opaque `unknown` AST payload.
        // We trust that only this module writes LocationMap entries under versioned keys.
        return cachedEntry.ast as LocationMap;
    }

    const locationMap = buildLocationMap(fileContent, filePath);

    // Store under the same versioned key used for retrieval — original code had a
    // key mismatch (stored `hash`, retrieved `versionedKey`), leading to perpetual
    // cache misses after the first write.
    await astCache.set(versionedKey, { filePath, ast: locationMap });

    return locationMap;
}

/**
 * Applies precise line/column coordinates from `locationMap` to each issue
 * that is still at its default position (line 1) and carries a config `path`.
 *
 * Mutates `issues` in place — this is intentional: callers hand over ownership
 * of the array and expect the enriched objects back through the same reference.
 */
function applyLocationsToIssues(
    issues: ConfigIssue[],
    locationMap: LocationMap,
    filePath: string,
): void {
    for (const issue of issues) {
        if (!issue.file) {
            issue.file = filePath;
        }

        const isAtDefaultPosition = (!issue.line || issue.line === 1) && Boolean(issue.path);
        if (!isAtDefaultPosition) continue;

        const pathKey = issue.path!.join(".");
        const location = locationMap[pathKey];

        if (location) {
            issue.line = location.line;
            issue.column = location.column;
        }
    }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Enriches `issues` in place with precise source-file line/column coordinates
 * derived from an AST parse of `fileContent`.
 *
 * Uses `astCache` when provided to avoid re-parsing unchanged files across
 * multiple validation passes. Pass `contentHash` when the caller has already
 * computed the file's SHA-1 digest to skip redundant hashing.
 *
 * @param issues       - Mutable array of config issues to enrich.
 * @param fileContent  - Raw source text of the config file.
 * @param filePath     - Absolute path to the config file (used for parse context).
 * @param astCache     - Optional two-tiered (L1 memory / L2 disk) AST cache.
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
