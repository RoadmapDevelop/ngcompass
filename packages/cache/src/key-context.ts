import { createRequire } from 'node:module';
import {
  PACKAGE_VERSION,
  CACHE_VERSION,
  stableSerialize,
} from '@ngcompass/common';
import { computeHash } from './hashing.js';

export interface CacheKeyContext {
  readonly toolVersion: string;

  readonly schemaVersion: string;

  readonly ruleRegistryHash: string;

  readonly parserVersion: string;

  readonly platform: string;
}

export function buildCacheKeyContext(
  ruleNames: ReadonlyArray<string>
): CacheKeyContext {
  const sortedNames = [...ruleNames].sort();
  const ruleRegistryHash = computeHash(stableSerialize(sortedNames));

  return Object.freeze<CacheKeyContext>({
    toolVersion: PACKAGE_VERSION,
    schemaVersion: CACHE_VERSION,
    ruleRegistryHash,
    parserVersion: resolveParserVersion(),
    platform: process.platform,
  });
}

export function serializeCacheKeyContext(ctx: CacheKeyContext): string {
  return [
    ctx.toolVersion,
    ctx.schemaVersion,
    ctx.parserVersion,
    ctx.ruleRegistryHash,
    ctx.platform,
  ].join('::');
}

function resolveParserVersion(): string {
  try {
    const require = createRequire(import.meta.url);
    const pkg = require('oxc-parser/package.json') as { version?: string };
    return String(pkg.version ?? 'unknown');
  } catch {
    return 'unknown';
  }
}
