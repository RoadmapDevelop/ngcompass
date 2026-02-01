import { ConfigIssue, ASTUtils, LocationMap, CACHE_VERSION } from "@ngcompass/common";
import { AstCache } from "../../cache/services/ast-cache.js";
import crypto from "node:crypto";

/**
 * Enriches configuration issues with precise location information (line/column).
 * Uses AST parsing and caching to efficiently find locations.
 */
export async function enrichIssueLocations(
    issues: ConfigIssue[],
    fileContent: string,
    filePath: string,
    astCache?: AstCache,
    contentHash?: string
): Promise<void> {
    if (!issues.length) return;

    let locMap: LocationMap | undefined;

    // 1. Try Cache
    if (astCache) {
        // Use provided hash or compute one
        const hash = contentHash || crypto.createHash("sha1").update(fileContent).digest("hex");
        const versionedKey = `v${CACHE_VERSION}:${hash}`;
        const entry = await astCache.get(versionedKey);

        if (entry) {
            locMap = entry.ast as LocationMap;
        } else {
            // Cache Miss: Parse & Store
            const source = ASTUtils.parse(fileContent, filePath);
            locMap = ASTUtils.generateLocationMap(source);
            await astCache.set(hash, { filePath, ast: locMap });
        }
    } else {
        // No Cache: Just Parse
        const source = ASTUtils.parse(fileContent, filePath);
        locMap = ASTUtils.generateLocationMap(source);
    }

    // 2. Map Issues to Locations
    if (locMap) {
        for (const issue of issues) {
            if (!issue.file) issue.file = filePath;

            // Only update if location is missing or default (1:1)
            if ((!issue.line || issue.line === 1) && issue.path) {
                const pathKey = issue.path.join('.');
                const loc = locMap[pathKey];

                if (loc) {
                    issue.line = loc.line;
                    issue.column = loc.column;
                }
            }
        }
    }
}
