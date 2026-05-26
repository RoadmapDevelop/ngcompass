import type { AstCache } from '@ngcompass/cache';
import { ASTUtils, CACHE_VERSION } from '@ngcompass/common';
import type { ConfigIssue, LocationMap } from '@ngcompass/common';
import { sha1Hex } from '../utils/hash.js';
import type { WritableIssue } from './types.js';

function buildVersionedCacheKey(contentHash: string): string {
  return `v${CACHE_VERSION}:${contentHash}`;
}

function buildLocationMap(fileContent: string, filePath: string): LocationMap {
  const sourceFile = ASTUtils.parse(fileContent, filePath);
  return ASTUtils.generateLocationMap(sourceFile);
}

function isLocationMap(value: unknown): value is LocationMap {
  if (!value || typeof value !== 'object') return false;

  for (const v of Object.values(value as Record<string, unknown>)) {
    return Boolean(v && typeof v === 'object' && 'line' in v && 'column' in v);
  }
  return true;
}

async function resolveLocationMap(
  fileContent: string,
  filePath: string,
  astCache: AstCache | undefined,
  contentHash: string
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

function applyLocationsToIssues(
  issues: ConfigIssue[],
  locationMap: LocationMap,
  filePath: string
): void {
  for (const issue of issues as WritableIssue[]) {
    if (!issue.file) issue.file = filePath;

    const isAtDefaultPosition =
      (!issue.line || issue.line === 1) && Boolean(issue.path);
    if (!isAtDefaultPosition) continue;

    const pathKey = issue.path!.join('.');
    const location = locationMap[pathKey];

    if (location) {
      issue.line = location.line;
      issue.column = location.column;
    }
  }
}

export async function enrichIssueLocations(
  issues: ConfigIssue[],
  fileContent: string,
  filePath: string,
  astCache?: AstCache,
  contentHash?: string
): Promise<void> {
  if (issues.length === 0) return;

  const hash = contentHash ?? sha1Hex(fileContent);
  const locationMap = await resolveLocationMap(
    fileContent,
    filePath,
    astCache,
    hash
  );

  applyLocationsToIssues(issues, locationMap, filePath);
}
