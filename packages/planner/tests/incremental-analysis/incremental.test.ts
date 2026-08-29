import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  filterCachedTasks,
  areAllTasksCached,
  getCacheHitRate,
  pruneStaleCache,
} from '../../src/incremental-analysis/incremental.js';
import type { Task } from '../../src/types.js';
import type { ResultCache } from '@ngcompass/cache';

const makeTask = (id: string): Task => ({
  taskId: id,
  ruleName: 'test-rule',
  filePath: `/src/${id}.ts`,
  severity: 'moderate',
  options: {},
  inputs: {
    typescript: { path: `/src/${id}.ts`, hash: `hash-${id}`, needsAst: false },
  },
});

const makeCache = (cachedIds: string[] = []): ResultCache => {
  const cached = new Set(cachedIds);
  return {
    hasMany: vi.fn(
      async (ids: string[]) => new Set(ids.filter((id) => cached.has(id)))
    ),
    getMany: vi.fn(async (ids: string[]) => {
      const map = new Map<string, unknown>();
      for (const id of ids) {
        if (cached.has(id)) map.set(id, { fromCache: true });
      }
      return map;
    }),
    getManyWithMetadata: vi.fn(async (ids: string[]) => {
      const map = new Map();
      for (const id of ids) {
        if (cached.has(id)) {
          map.set(id, {
            metadata: { taskId: id, timestamp: Date.now() - 1000, hits: 5 },
          });
        }
      }
      return map;
    }),
    delete: vi.fn(async () => {}),
    get: vi.fn(),
    set: vi.fn(),
    has: vi.fn(),
    clear: vi.fn(),
  } as unknown as ResultCache;
};

describe('filterCachedTasks', () => {
  it('returns all tasks as pending when cache is empty', async () => {
    const tasks = [makeTask('t1'), makeTask('t2')];
    const cache = makeCache([]);
    const result = await filterCachedTasks(tasks, cache);

    expect(result.tasks).toHaveLength(2);
    expect(result.skippedTasks).toHaveLength(0);
    expect(result.stats.cacheHitRate).toBe(0);
    expect(result.stats.timeSavedEstimate).toBe(0);
  });

  it('skips tasks found in cache', async () => {
    const tasks = [makeTask('t1'), makeTask('t2'), makeTask('t3')];
    const cache = makeCache(['t1', 't3']);
    const result = await filterCachedTasks(tasks, cache);

    expect(result.tasks).toHaveLength(1);
    expect(result.tasks[0].taskId).toBe('t2');
    expect(result.skippedTasks).toHaveLength(2);
  });

  it('returns correct cache hit rate', async () => {
    const tasks = [
      makeTask('t1'),
      makeTask('t2'),
      makeTask('t3'),
      makeTask('t4'),
    ];
    const cache = makeCache(['t1', 't2']);
    const result = await filterCachedTasks(tasks, cache);

    expect(result.stats.cacheHitRate).toBe(0.5);
    expect(result.stats.timeSavedEstimate).toBe(50);
    expect(result.stats.cachedTasks).toBe(2);
    expect(result.stats.pendingTasks).toBe(2);
    expect(result.stats.totalTasks).toBe(4);
  });

  it('loads cached results when loadCachedResults is true', async () => {
    const tasks = [makeTask('t1'), makeTask('t2')];
    const cache = makeCache(['t1']);
    const result = await filterCachedTasks(tasks, cache, {
      loadCachedResults: true,
    });

    expect(result.cachedResults.size).toBe(1);
    expect(result.cachedResults.has('t1')).toBe(true);
  });

  it('does not load cached results when loadCachedResults is false (default)', async () => {
    const tasks = [makeTask('t1'), makeTask('t2')];
    const cache = makeCache(['t1']);
    const result = await filterCachedTasks(tasks, cache);

    expect(result.cachedResults.size).toBe(0);
  });

  it('skips cache when forceRerun is true', async () => {
    const tasks = [makeTask('t1'), makeTask('t2')];
    const cache = makeCache(['t1', 't2']);
    const result = await filterCachedTasks(tasks, cache, { forceRerun: true });

    expect(result.tasks).toHaveLength(2);
    expect(result.skippedTasks).toHaveLength(0);
    expect(result.stats.cacheHitRate).toBe(0);
  });

  it('handles empty task list', async () => {
    const cache = makeCache([]);
    const result = await filterCachedTasks([], cache);

    expect(result.tasks).toHaveLength(0);
    expect(result.skippedTasks).toHaveLength(0);
    expect(result.stats.totalTasks).toBe(0);
  });

  it('returns 100% hit rate when all tasks are cached', async () => {
    const tasks = [makeTask('t1'), makeTask('t2')];
    const cache = makeCache(['t1', 't2']);
    const result = await filterCachedTasks(tasks, cache);

    expect(result.tasks).toHaveLength(0);
    expect(result.skippedTasks).toHaveLength(2);
    expect(result.stats.cacheHitRate).toBe(1);
    expect(result.stats.timeSavedEstimate).toBe(100);
  });
});

describe('areAllTasksCached', () => {
  it('returns true when all tasks are in cache', async () => {
    const tasks = [makeTask('t1'), makeTask('t2')];
    const cache = makeCache(['t1', 't2']);
    expect(await areAllTasksCached(tasks, cache)).toBe(true);
  });

  it('returns false when at least one task is missing', async () => {
    const tasks = [makeTask('t1'), makeTask('t2')];
    const cache = makeCache(['t1']);
    expect(await areAllTasksCached(tasks, cache)).toBe(false);
  });

  it('returns true for an empty task list', async () => {
    const cache = makeCache([]);
    expect(await areAllTasksCached([], cache)).toBe(true);
  });
});

describe('getCacheHitRate', () => {
  it('returns 0 for empty task list', async () => {
    const cache = makeCache([]);
    expect(await getCacheHitRate([], cache)).toBe(0);
  });

  it('returns 0.5 when half the tasks are cached', async () => {
    const tasks = [makeTask('t1'), makeTask('t2')];
    const cache = makeCache(['t1']);
    expect(await getCacheHitRate(tasks, cache)).toBe(0.5);
  });

  it('returns 1 when all tasks are cached', async () => {
    const tasks = [makeTask('t1')];
    const cache = makeCache(['t1']);
    expect(await getCacheHitRate(tasks, cache)).toBe(1);
  });
});

describe('pruneStaleCache', () => {
  it('returns 0 when task list is empty', async () => {
    const cache = makeCache([]);
    const removed = await pruneStaleCache([], cache);
    expect(removed).toBe(0);
  });

  it('prunes entries that exceed maxAge', async () => {
    const taskIds = ['old-t1'];
    const oneHour = 60 * 60 * 1000;
    const veryOldTimestamp = Date.now() - 10 * 24 * 60 * 60 * 1000;

    const cache = {
      getManyWithMetadata: vi.fn(
        async () =>
          new Map([
            [
              'old-t1',
              {
                metadata: {
                  taskId: 'old-t1',
                  timestamp: veryOldTimestamp,
                  hits: 5,
                },
              },
            ],
          ])
      ),
      delete: vi.fn(async () => {}),
    } as unknown as ResultCache;

    const removed = await pruneStaleCache(taskIds, cache, { maxAge: oneHour });
    expect(removed).toBe(1);
    expect(cache.delete).toHaveBeenCalledWith('old-t1');
  });

  it('prunes entries below minHits', async () => {
    const taskIds = ['cold-t1'];
    const cache = {
      getManyWithMetadata: vi.fn(
        async () =>
          new Map([
            [
              'cold-t1',
              {
                metadata: { taskId: 'cold-t1', timestamp: Date.now(), hits: 0 },
              },
            ],
          ])
      ),
      delete: vi.fn(async () => {}),
    } as unknown as ResultCache;

    const removed = await pruneStaleCache(taskIds, cache, { minHits: 1 });
    expect(removed).toBe(1);
  });

  it('does not prune hot recent entries', async () => {
    const taskIds = ['hot-t1'];
    const cache = {
      getManyWithMetadata: vi.fn(
        async () =>
          new Map([
            [
              'hot-t1',
              {
                metadata: { taskId: 'hot-t1', timestamp: Date.now(), hits: 10 },
              },
            ],
          ])
      ),
      delete: vi.fn(async () => {}),
    } as unknown as ResultCache;

    const removed = await pruneStaleCache(taskIds, cache);
    expect(removed).toBe(0);
    expect(cache.delete).not.toHaveBeenCalled();
  });
});
