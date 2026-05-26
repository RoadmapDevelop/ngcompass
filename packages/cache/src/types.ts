import type { SourceCache } from './services/source-cache.js';
import type { AstCache } from './services/ast-cache.js';
import type { ResultCache } from './services/result-cache.js';
import type { ConfigCache } from './services/config-cache.js';
import type { MetaCache } from './services/meta-cache.js';
import type { PlanCache } from './services/plan-cache.js';
import type { FileCache } from './services/file-cache.js';

export type {
  SourceCache,
  AstCache,
  ResultCache,
  ConfigCache,
  MetaCache,
  PlanCache,
  FileCache,
};
export type { FileCacheEntry } from './services/file-cache.js';
export type { FileMeta } from './services/meta-cache.js';

export interface CacheInfo {
  ast: {
    l1: { entries: number; maxEntries: number; size: number };
    l2: { entries: number; size: number };
  };
  config: { entries: number; size: number };
  results: { entries: number; size: number };

  totalSize: number;

  location: string;

  version: string;
}

export interface CacheContext {
  sources: SourceCache;
  asts: AstCache;
  results: ResultCache;
  configs: ConfigCache;
  metas: MetaCache;
  plans: PlanCache;
  files: FileCache;

  analysis: ResultCache;

  computeHash: (content: string, salt?: string) => string;

  prune: () => Promise<void>;

  clear: () => Promise<void>;

  clearType: (type: 'ast' | 'config' | 'results' | 'all') => Promise<void>;

  getInfo: () => Promise<CacheInfo>;

  getCachePath: () => string;

  flush: () => Promise<void>;
}
