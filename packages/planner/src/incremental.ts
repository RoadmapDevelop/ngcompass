import { type ResultCache } from '@ngcompass/cache';
import { debug } from '@ngcompass/common';
import type {
  CacheFilterStats,
  CachePruneOptions,
  IncrementalFilterOptions,
  IncrementalPlan,
  Task,
} from './models/index.js';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const DELETE_BATCH_SIZE = 100;

export const filterCachedTasks = async (
  tasks: ReadonlyArray<Task>,
  cache: ResultCache,
  options: IncrementalFilterOptions = {}
): Promise<IncrementalPlan> => {
  const startTime = performance.now();

  debug('incremental', `Filtering ${tasks.length} tasks by cache...`);

  if (options.forceRerun) return buildForcedRerunPlan(tasks);
  if (tasks.length === 0) return buildEmptyIncrementalPlan();

  const cachedTaskIds = await cache.hasMany(tasks.map((t) => t.taskId));
  debug(
    'incremental',
    `Found ${cachedTaskIds.size}/${tasks.length} tasks in cache`
  );

  const { skippedTasks, tasks: pendingTasks } = splitTasksByCache(
    tasks,
    cachedTaskIds
  );
  const cachedResults = await maybeLoadCachedResults(
    cache,
    skippedTasks,
    options
  );
  const stats = buildCacheFilterStats(
    tasks.length,
    skippedTasks.length,
    pendingTasks.length
  );

  logFilterSummary(startTime, stats);
  return { skippedTasks, tasks: pendingTasks, cachedResults, stats };
};

export const areAllTasksCached = async (
  tasks: ReadonlyArray<Task>,
  cache: ResultCache
): Promise<boolean> => {
  if (tasks.length === 0) return true;
  const cachedTaskIds = await cache.hasMany(tasks.map((t) => t.taskId));
  return cachedTaskIds.size === tasks.length;
};

export const getCacheHitRate = async (
  tasks: ReadonlyArray<Task>,
  cache: ResultCache
): Promise<number> => {
  if (tasks.length === 0) return 0;
  const cachedTaskIds = await cache.hasMany(tasks.map((t) => t.taskId));
  return cachedTaskIds.size / tasks.length;
};

export const pruneStaleCache = async (
  taskIds: ReadonlyArray<string>,
  cache: ResultCache,
  options: CachePruneOptions = {}
): Promise<number> => {
  debug('incremental', 'Pruning stale cache entries...');

  if (taskIds.length === 0) {
    debug('incremental', 'No tasks to prune');
    return 0;
  }

  const entries = await cache.getManyWithMetadata(taskIds);
  if (entries.size === 0) {
    debug('incremental', 'Cache is empty, nothing to prune');
    return 0;
  }

  const { now, maxAgeMs, minHits } = resolvePrunePolicy(options);
  const staleTaskIds = collectStaleTaskIds(entries, now, maxAgeMs, minHits);
  const prunedCount = await deleteInBatches(cache, staleTaskIds);

  debug('incremental', `Pruned ${prunedCount} stale entries`);
  return prunedCount;
};

const buildForcedRerunPlan = (tasks: ReadonlyArray<Task>): IncrementalPlan => {
  debug('incremental', 'Force rerun enabled - skipping cache check');
  return {
    skippedTasks: [],
    tasks,
    cachedResults: new Map(),
    stats: {
      totalTasks: tasks.length,
      cachedTasks: 0,
      pendingTasks: tasks.length,
      cacheHitRate: 0,
      timeSavedEstimate: 0,
    },
  };
};

const buildEmptyIncrementalPlan = (): IncrementalPlan => ({
  skippedTasks: [],
  tasks: [],
  cachedResults: new Map(),
  stats: {
    totalTasks: 0,
    cachedTasks: 0,
    pendingTasks: 0,
    cacheHitRate: 0,
    timeSavedEstimate: 0,
  },
});

const splitTasksByCache = (
  tasks: ReadonlyArray<Task>,
  cachedTaskIds: ReadonlySet<string>
): { skippedTasks: Task[]; tasks: Task[] } => {
  const skippedTasks: Task[] = [];
  const pendingTasks: Task[] = [];
  for (const task of tasks) {
    if (cachedTaskIds.has(task.taskId)) skippedTasks.push(task);
    else pendingTasks.push(task);
  }
  return { skippedTasks, tasks: pendingTasks };
};

const maybeLoadCachedResults = async (
  cache: ResultCache,
  cachedTasks: ReadonlyArray<Task>,
  options: IncrementalFilterOptions
): Promise<ReadonlyMap<string, unknown>> => {
  if (!options.loadCachedResults || cachedTasks.length === 0) {
    return new Map<string, unknown>();
  }

  debug('incremental', `Loading ${cachedTasks.length} cached results...`);
  const cachedResults = await cache.getMany(cachedTasks.map((t) => t.taskId));
  debug('incremental', `Loaded ${cachedResults.size} cached results`);
  return cachedResults;
};

const buildCacheFilterStats = (
  total: number,
  cached: number,
  pending: number
): CacheFilterStats => {
  const cacheHitRate = total > 0 ? cached / total : 0;
  return {
    totalTasks: total,
    cachedTasks: cached,
    pendingTasks: pending,
    cacheHitRate,
    timeSavedEstimate: cacheHitRate * 100,
  };
};

const logFilterSummary = (startTime: number, stats: CacheFilterStats): void => {
  const elapsed = performance.now() - startTime;
  debug('incremental', `Cache filtering completed in ${elapsed.toFixed(2)}ms`);
  debug(
    'incremental',
    `Cache hit rate: ${(stats.cacheHitRate * 100).toFixed(1)}%`
  );
  debug(
    'incremental',
    `Skipping ${stats.cachedTasks} tasks, executing ${stats.pendingTasks} tasks`
  );
};

const resolvePrunePolicy = (
  options: CachePruneOptions
): { now: number; maxAgeMs: number; minHits: number } => ({
  now: Date.now(),
  maxAgeMs: options.maxAge ?? SEVEN_DAYS_MS,
  minHits: options.minHits ?? 1,
});

const collectStaleTaskIds = (
  entries: ReadonlyMap<
    string,
    { metadata: { taskId: string; timestamp: number; hits: number } }
  >,
  now: number,
  maxAgeMs: number,
  minHits: number
): string[] => {
  const stale: string[] = [];
  for (const [, entry] of entries) {
    const ageMs = now - entry.metadata.timestamp;
    if (ageMs > maxAgeMs || entry.metadata.hits < minHits) {
      stale.push(entry.metadata.taskId);
    }
  }
  return stale;
};

const deleteInBatches = async (
  cache: ResultCache,
  taskIds: ReadonlyArray<string>
): Promise<number> => {
  let deleted = 0;
  for (let i = 0; i < taskIds.length; i += DELETE_BATCH_SIZE) {
    const batch = taskIds.slice(i, i + DELETE_BATCH_SIZE);
    await Promise.all(batch.map((id) => cache.delete(id)));
    deleted += batch.length;
  }
  return deleted;
};
