import type { Task } from './task.js';

export interface CacheFilterStats {
  readonly totalTasks: number;

  readonly cachedTasks: number;

  readonly pendingTasks: number;

  readonly cacheHitRate: number;

  readonly timeSavedEstimate: number;
}

export interface IncrementalPlan {
  readonly skippedTasks: ReadonlyArray<Task>;

  readonly tasks: ReadonlyArray<Task>;

  readonly cachedResults: ReadonlyMap<string, unknown>;

  readonly stats: CacheFilterStats;
}

export interface IncrementalFilterOptions {
  readonly forceRerun?: boolean;

  readonly loadCachedResults?: boolean;

  readonly maxCacheAge?: number;
}

export interface CachePruneOptions {
  readonly maxAge?: number;

  readonly maxEntries?: number;

  readonly minHits?: number;
}
