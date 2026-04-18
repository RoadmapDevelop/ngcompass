/**
 * Incremental Planner (Phase 2.0)
 *
 * Filters execution tasks by cache status.
 * Splits tasks into cached (skip) and pending (execute).
 */

import type {
    Task,
    IncrementalPlan,
    CacheFilterStats,
    IncrementalFilterOptions,
    CachePruneOptions,
} from "./types.js";
import { ResultCache } from "@ngcompass/cache";
import { debug } from "@ngcompass/common";

/**
 * Filters tasks by cache status.
 *
 * @param tasks - All tasks from execution plan
 * @param cache - Result cache
 * @param options - Filter options
 * @returns Incremental plan with cache split
 */
export const filterCachedTasks = async (
    tasks: ReadonlyArray<Task>,
    cache: ResultCache,
    options: IncrementalFilterOptions = {}
): Promise<IncrementalPlan> => {
    const startTime = performance.now();

    debug("incremental", `Filtering ${tasks.length} tasks by cache...`);

    if (options.forceRerun) {
        return buildForcedRerunPlan(tasks);
    }

    const taskIds = tasks.map((t) => t.taskId);
    if (taskIds.length === 0) {
        return buildEmptyIncrementalPlan();
    }

    const cachedTaskIds = await cache.hasMany(taskIds);
    debug("incremental", `Found ${cachedTaskIds.size}/${tasks.length} tasks in cache`);

    const { skippedTasks, tasks: pendingTasks } = splitTasksByCache(tasks, cachedTaskIds);

    const cachedResults = await maybeLoadCachedResults(cache, skippedTasks, options);
    const stats = buildCacheFilterStats(tasks.length, skippedTasks.length, pendingTasks.length);

    logFilterSummary(startTime, stats);

    return { skippedTasks, tasks: pendingTasks, cachedResults, stats };
};

/**
 * Checks if all tasks are cached.
 *
 * @param tasks - Tasks to check
 * @param cache - Result cache
 * @returns true if all tasks are cached
 */
export const areAllTasksCached = async (
    tasks: ReadonlyArray<Task>,
    cache: ResultCache
): Promise<boolean> => {
    if (tasks.length === 0) return true;

    const taskIds = tasks.map((t) => t.taskId);
    const cachedTaskIds = await cache.hasMany(taskIds);

    return cachedTaskIds.size === tasks.length;
};

/**
 * Gets cache hit rate for a set of tasks.
 *
 * @param tasks - Tasks to check
 * @param cache - Result cache
 * @returns Cache hit rate (0.0 to 1.0)
 */
export const getCacheHitRate = async (
    tasks: ReadonlyArray<Task>,
    cache: ResultCache
): Promise<number> => {
    if (tasks.length === 0) return 0;

    const taskIds = tasks.map((t) => t.taskId);
    const cachedTaskIds = await cache.hasMany(taskIds);

    return cachedTaskIds.size / tasks.length;
};

/**
 * Prunes stale cache entries.
 *
 * @param taskIds - All current task IDs
 * @param cache - Result cache
 * @param options - Prune options
 * @returns Number of entries removed
 */
export const pruneStaleCache = async (
    taskIds: ReadonlyArray<string>,
    cache: ResultCache,
    options: CachePruneOptions = {}
): Promise<number> => {
    debug("incremental", "Pruning stale cache entries...");

    if (taskIds.length === 0) {
        debug("incremental", "No tasks to prune");
        return 0;
    }

    const entries = await cache.getManyWithMetadata(taskIds);
    if (entries.size === 0) {
        debug("incremental", "Cache is empty, nothing to prune");
        return 0;
    }

    const { now, maxAgeMs, minHits } = resolvePrunePolicy(options);

    const staleTaskIds = collectStaleTaskIds(entries, now, maxAgeMs, minHits);
    const prunedCount = await deleteMany(cache, staleTaskIds);

    debug("incremental", `Pruned ${prunedCount} stale entries`);
    return prunedCount;
};

/**
 * Builds a plan when force rerun is enabled.
 *
 * @param tasks - All tasks
 * @returns Incremental plan with all tasks pending
 */
const buildForcedRerunPlan = (tasks: ReadonlyArray<Task>): IncrementalPlan => {
    debug("incremental", "Force rerun enabled - skipping cache check");

    const stats: CacheFilterStats = {
        totalTasks: tasks.length,
        cachedTasks: 0,
        pendingTasks: tasks.length,
        cacheHitRate: 0,
        timeSavedEstimate: 0,
    };

    return {
        skippedTasks: [],
        tasks: tasks,
        cachedResults: new Map(),
        stats,
    };
};

/**
 * Builds an empty incremental plan.
 *
 * @returns Empty IncrementalPlan
 */
const buildEmptyIncrementalPlan = (): IncrementalPlan => {
    const stats: CacheFilterStats = {
        totalTasks: 0,
        cachedTasks: 0,
        pendingTasks: 0,
        cacheHitRate: 0,
        timeSavedEstimate: 0,
    };

    return {
        skippedTasks: [],
        tasks: [],
        cachedResults: new Map(),
        stats,
    };
};

/**
 * Splits tasks into cached and pending buckets.
 *
 * @param tasks - All tasks
 * @param cachedTaskIds - Set of cached task IDs
 * @returns Split task arrays
 */
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

/**
 * Loads cached results when enabled.
 *
 * @param cache - Result cache
 * @param cachedTasks - Cached tasks
 * @param options - Filter options
 * @returns Cached results map
 */
const maybeLoadCachedResults = async (
    cache: ResultCache,
    cachedTasks: ReadonlyArray<Task>,
    options: IncrementalFilterOptions
): Promise<ReadonlyMap<string, unknown>> => {
    if (!options.loadCachedResults) return new Map<string, unknown>();
    if (cachedTasks.length === 0) return new Map<string, unknown>();

    debug("incremental", `Loading ${cachedTasks.length} cached results...`);

    const cachedIds = cachedTasks.map((t) => t.taskId);
    const cachedResults = await cache.getMany(cachedIds);

    debug("incremental", `Loaded ${cachedResults.size} cached results`);
    return cachedResults;
};

/**
 * Builds cache filter statistics.
 *
 * @param total - Total tasks
 * @param cached - Cached tasks
 * @param pending - Pending tasks
 * @returns CacheFilterStats
 */
const buildCacheFilterStats = (total: number, cached: number, pending: number): CacheFilterStats => {
    const cacheHitRate = total > 0 ? cached / total : 0;
    const timeSavedEstimate = cacheHitRate * 100;

    return {
        totalTasks: total,
        cachedTasks: cached,
        pendingTasks: pending,
        cacheHitRate,
        timeSavedEstimate,
    };
};

/**
 * Logs filter timing and summary statistics.
 *
 * @param startTime - Filtering start timestamp
 * @param stats - Filter stats
 */
const logFilterSummary = (startTime: number, stats: CacheFilterStats): void => {
    const elapsed = performance.now() - startTime;

    debug("incremental", `Cache filtering completed in ${elapsed.toFixed(2)}ms`);
    debug("incremental", `Cache hit rate: ${(stats.cacheHitRate * 100).toFixed(1)}%`);
    debug("incremental", `Skipping ${stats.cachedTasks} tasks, executing ${stats.pendingTasks} tasks`);
};

/**
 * Resolves prune policy from options with defaults applied.
 *
 * @param options - Prune options
 * @returns Prune policy values
 */
const resolvePrunePolicy = (
    options: CachePruneOptions
): { now: number; maxAgeMs: number; minHits: number } => {
    const now = Date.now();
    const maxAgeMs = options.maxAge ?? 7 * 24 * 60 * 60 * 1000;
    const minHits = options.minHits ?? 1;

    return { now, maxAgeMs, minHits };
};

/**
 * Collects task IDs that should be pruned based on metadata.
 *
 * @param entries - Cache entries with metadata
 * @param now - Current time
 * @param maxAgeMs - Maximum entry age in ms
 * @param minHits - Minimum hit count
 * @returns Array of task IDs to prune
 */
const collectStaleTaskIds = (
    entries: ReadonlyMap<string, { metadata: { taskId: string; timestamp: number; hits: number } }>,
    now: number,
    maxAgeMs: number,
    minHits: number
): string[] => {
    const stale: string[] = [];

    for (const [, entry] of entries) {
        const ageMs = now - entry.metadata.timestamp;
        const tooOld = ageMs > maxAgeMs;
        const tooCold = entry.metadata.hits < minHits;

        if (tooOld || tooCold) stale.push(entry.metadata.taskId);
    }

    return stale;
};

/**
 * Deletes multiple cache entries sequentially.
 *
 * @param cache - Result cache
 * @param taskIds - Task IDs to delete
 * @returns Number of deletions performed
 */
const deleteMany = async (cache: ResultCache, taskIds: ReadonlyArray<string>): Promise<number> => {
    let deleted = 0;

    for (const taskId of taskIds) {
        await cache.delete(taskId);
        deleted++;
    }

    return deleted;
};

