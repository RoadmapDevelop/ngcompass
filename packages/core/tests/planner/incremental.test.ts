/**
 * Tests for Incremental Planner (Phase 2.0)
 */

import { describe, it, expect } from 'vitest';
import { filterCachedTasks, areAllTasksCached, getCacheHitRate, pruneStaleCache } from '../../src/planner/incremental.js';
import { createResultCache } from '../../src/cache/services/result-cache.js';
import { createMemoryDriver } from '../../src/cache/drivers/memory.js';
import type { Task } from '../../src/planner/types.js';
import type { AsyncDriver } from '../../src/cache/drivers/types.js';

// Helper to create async memory driver for ResultCache
const createAsyncMemoryDriver = <T>(options = {}): AsyncDriver<T> => {
    const syncDriver = createMemoryDriver<T>(options);
    return {
        get: async (key) => syncDriver.get(key),
        set: async (key, value) => { syncDriver.set(key, value); },
        has: async (key) => syncDriver.has(key),
        delete: async (key) => { syncDriver.delete(key); },
        clear: async () => { syncDriver.clear(); },
        getStats: async () => Promise.resolve(syncDriver.getStats()),
    };
};

describe('Incremental Planner', () => {
    // Helper to create a test task
    const createTask = (id: string, ruleName: string, filePath: string): Task => ({
        taskId: id,
        ruleName,
        filePath,
        severity: 'critical',
        options: {},
        inputs: {
            typescript: {
                path: filePath,
                hash: `hash-${id}`,
                needsAst: true,
            },
        },
    });

    describe('filterCachedTasks', () => {
        it('should split tasks into cached and pending', async () => {
            const driver = createAsyncMemoryDriver({ maxItems: 100 });
            const cache = createResultCache(driver);

            const tasks: Task[] = [
                createTask('task1', 'rule-a', 'file1.ts'),
                createTask('task2', 'rule-b', 'file2.ts'),
                createTask('task3', 'rule-c', 'file3.ts'),
            ];

            // Cache first two tasks
            await cache.set('task1', { result: 'ok' });
            await cache.set('task2', { result: 'ok' });

            const plan = await filterCachedTasks(tasks, cache);

            expect(plan.cached).toHaveLength(2);
            expect(plan.pending).toHaveLength(1);
            expect(plan.cached[0].taskId).toBe('task1');
            expect(plan.cached[1].taskId).toBe('task2');
            expect(plan.pending[0].taskId).toBe('task3');
        });

        it('should calculate correct cache statistics', async () => {
            const driver = createAsyncMemoryDriver({ maxItems: 100 });
            const cache = createResultCache(driver);

            const tasks: Task[] = [
                createTask('task1', 'rule-a', 'file1.ts'),
                createTask('task2', 'rule-b', 'file2.ts'),
                createTask('task3', 'rule-c', 'file3.ts'),
                createTask('task4', 'rule-d', 'file4.ts'),
            ];

            // Cache 3 out of 4
            await cache.set('task1', { result: 'ok' });
            await cache.set('task2', { result: 'ok' });
            await cache.set('task3', { result: 'ok' });

            const plan = await filterCachedTasks(tasks, cache);

            expect(plan.stats.totalTasks).toBe(4);
            expect(plan.stats.cachedTasks).toBe(3);
            expect(plan.stats.pendingTasks).toBe(1);
            expect(plan.stats.cacheHitRate).toBe(0.75);
            expect(plan.stats.timeSavedEstimate).toBe(75);
        });

        it('should handle empty task list', async () => {
            const driver = createAsyncMemoryDriver({ maxItems: 100 });
            const cache = createResultCache(driver);

            const plan = await filterCachedTasks([], cache);

            expect(plan.cached).toHaveLength(0);
            expect(plan.pending).toHaveLength(0);
            expect(plan.stats.cacheHitRate).toBe(0);
        });

        it('should handle no cached tasks', async () => {
            const driver = createAsyncMemoryDriver({ maxItems: 100 });
            const cache = createResultCache(driver);

            const tasks: Task[] = [
                createTask('task1', 'rule-a', 'file1.ts'),
                createTask('task2', 'rule-b', 'file2.ts'),
            ];

            const plan = await filterCachedTasks(tasks, cache);

            expect(plan.cached).toHaveLength(0);
            expect(plan.pending).toHaveLength(2);
            expect(plan.stats.cacheHitRate).toBe(0);
        });

        it('should handle all tasks cached', async () => {
            const driver = createAsyncMemoryDriver({ maxItems: 100 });
            const cache = createResultCache(driver);

            const tasks: Task[] = [
                createTask('task1', 'rule-a', 'file1.ts'),
                createTask('task2', 'rule-b', 'file2.ts'),
            ];

            await cache.set('task1', { result: 'ok' });
            await cache.set('task2', { result: 'ok' });

            const plan = await filterCachedTasks(tasks, cache);

            expect(plan.cached).toHaveLength(2);
            expect(plan.pending).toHaveLength(0);
            expect(plan.stats.cacheHitRate).toBe(1.0);
        });

        it('should respect forceRerun option', async () => {
            const driver = createAsyncMemoryDriver({ maxItems: 100 });
            const cache = createResultCache(driver);

            const tasks: Task[] = [
                createTask('task1', 'rule-a', 'file1.ts'),
            ];

            await cache.set('task1', { result: 'ok' });

            const plan = await filterCachedTasks(tasks, cache, { forceRerun: true });

            expect(plan.cached).toHaveLength(0);
            expect(plan.pending).toHaveLength(1);
        });

        it('should load cached results when requested', async () => {
            const driver = createAsyncMemoryDriver({ maxItems: 100 });
            const cache = createResultCache(driver);

            const tasks: Task[] = [
                createTask('task1', 'rule-a', 'file1.ts'),
                createTask('task2', 'rule-b', 'file2.ts'),
            ];

            const result1 = { violations: ['error1'] };
            const result2 = { violations: ['error2'] };

            await cache.set('task1', result1);
            await cache.set('task2', result2);

            const plan = await filterCachedTasks(tasks, cache, { loadCachedResults: true });

            expect(plan.cachedResults.size).toBe(2);
            expect(plan.cachedResults.get('task1')).toEqual(result1);
            expect(plan.cachedResults.get('task2')).toEqual(result2);
        });

        it('should not load results by default', async () => {
            const driver = createAsyncMemoryDriver({ maxItems: 100 });
            const cache = createResultCache(driver);

            const tasks: Task[] = [
                createTask('task1', 'rule-a', 'file1.ts'),
            ];

            await cache.set('task1', { result: 'ok' });

            const plan = await filterCachedTasks(tasks, cache);

            expect(plan.cachedResults.size).toBe(0);
        });
    });

    describe('areAllTasksCached', () => {
        it('should return true when all tasks cached', async () => {
            const driver = createAsyncMemoryDriver({ maxItems: 100 });
            const cache = createResultCache(driver);

            const tasks: Task[] = [
                createTask('task1', 'rule-a', 'file1.ts'),
                createTask('task2', 'rule-b', 'file2.ts'),
            ];

            await cache.set('task1', { result: 'ok' });
            await cache.set('task2', { result: 'ok' });

            const allCached = await areAllTasksCached(tasks, cache);

            expect(allCached).toBe(true);
        });

        it('should return false when some tasks not cached', async () => {
            const driver = createAsyncMemoryDriver({ maxItems: 100 });
            const cache = createResultCache(driver);

            const tasks: Task[] = [
                createTask('task1', 'rule-a', 'file1.ts'),
                createTask('task2', 'rule-b', 'file2.ts'),
            ];

            await cache.set('task1', { result: 'ok' });

            const allCached = await areAllTasksCached(tasks, cache);

            expect(allCached).toBe(false);
        });

        it('should return true for empty task list', async () => {
            const driver = createAsyncMemoryDriver({ maxItems: 100 });
            const cache = createResultCache(driver);

            const allCached = await areAllTasksCached([], cache);

            expect(allCached).toBe(true);
        });
    });

    describe('getCacheHitRate', () => {
        it('should calculate hit rate correctly', async () => {
            const driver = createAsyncMemoryDriver({ maxItems: 100 });
            const cache = createResultCache(driver);

            const tasks: Task[] = [
                createTask('task1', 'rule-a', 'file1.ts'),
                createTask('task2', 'rule-b', 'file2.ts'),
                createTask('task3', 'rule-c', 'file3.ts'),
                createTask('task4', 'rule-d', 'file4.ts'),
            ];

            await cache.set('task1', { result: 'ok' });
            await cache.set('task3', { result: 'ok' });

            const hitRate = await getCacheHitRate(tasks, cache);

            expect(hitRate).toBe(0.5);
        });

        it('should return 0 for empty task list', async () => {
            const driver = createAsyncMemoryDriver({ maxItems: 100 });
            const cache = createResultCache(driver);

            const hitRate = await getCacheHitRate([], cache);

            expect(hitRate).toBe(0);
        });

        it('should return 1.0 when all cached', async () => {
            const driver = createAsyncMemoryDriver({ maxItems: 100 });
            const cache = createResultCache(driver);

            const tasks: Task[] = [
                createTask('task1', 'rule-a', 'file1.ts'),
                createTask('task2', 'rule-b', 'file2.ts'),
            ];

            await cache.set('task1', { result: 'ok' });
            await cache.set('task2', { result: 'ok' });

            const hitRate = await getCacheHitRate(tasks, cache);

            expect(hitRate).toBe(1.0);
        });
    });

    describe('pruneStaleCache', () => {
        it('should prune stale entries based on age', async () => {
            const driver = createAsyncMemoryDriver({ maxItems: 100 });
            const cache = createResultCache(driver);

            // Create old entry
            const oldTime = Date.now() - (8 * 24 * 60 * 60 * 1000); // 8 days ago
            await cache.set('old-task', { result: 'ok' });
            await cache.updateMetadata('old-task', { timestamp: oldTime, hits: 10 });

            // Create new entry
            await cache.set('new-task', { result: 'ok' });

            const pruned = await pruneStaleCache(['old-task', 'new-task'], cache, { maxAge: 7 * 24 * 60 * 60 * 1000 });

            expect(pruned).toBe(1);
            expect(await cache.has('old-task')).toBe(false);
            expect(await cache.has('new-task')).toBe(true);
        });

        it('should prune entries with low hits', async () => {
            const driver = createMemoryDriver({ maxItems: 100 });
            const cache = createResultCache(driver);

            // Create entry with low hits
            await cache.set('low-hits', { result: 'ok' });
            await cache.updateMetadata('low-hits', { hits: 0 });

            // Create entry with high hits
            await cache.set('high-hits', { result: 'ok' });
            await cache.updateMetadata('high-hits', { hits: 10 });

            const pruned = await pruneStaleCache(['low-hits', 'high-hits'], cache, { minHits: 5 });

            expect(pruned).toBe(1);
            expect(await cache.has('low-hits')).toBe(false);
            expect(await cache.has('high-hits')).toBe(true);
        });
    });

    describe('Bulk operations performance', () => {
        it('should efficiently handle large task lists', async () => {
            const driver = createAsyncMemoryDriver({ maxItems: 10000 });
            const cache = createResultCache(driver);

            // Create 1000 tasks
            const tasks: Task[] = [];
            for (let i = 0; i < 1000; i++) {
                tasks.push(createTask(`task${i}`, `rule-${i % 10}`, `file${i}.ts`));
            }

            // Cache half of them
            for (let i = 0; i < 500; i++) {
                await cache.set(`task${i}`, { result: 'ok' });
            }

            const startTime = performance.now();
            const plan = await filterCachedTasks(tasks, cache);
            const elapsed = performance.now() - startTime;

            expect(plan.cached).toHaveLength(500);
            expect(plan.pending).toHaveLength(500);
            expect(elapsed).toBeLessThan(1000); // Should be fast (< 1s)
        });
    });
});
