import type {
  AstCache,
  ConfigCache,
  FileCache,
  MetaCache,
  PlanCache,
  ResultCache,
  SourceCache,
} from './cache-service.js';

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

export interface CreateRuntimeCacheOptions {
  allowDisabled?: boolean;
}
