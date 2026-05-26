import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createResultCache } from '../../src/services/result-cache.js';
import { AsyncDriver } from '../../src/drivers/types.js';

const createMockDriver = (): AsyncDriver<any> => {
  const store = new Map<string, any>();
  return {
    get: async (key) => store.get(key),
    set: async (key, val) => {
      store.set(key, val);
    },
    has: async (key) => store.has(key),
    delete: async (key) => {
      store.delete(key);
    },
    clear: async () => {
      store.clear();
    },
    getStats: async () => ({ entries: store.size, size: 0 }),
  };
};

describe('createResultCache', () => {
  let driver: AsyncDriver<any>;

  beforeEach(() => {
    driver = createMockDriver();
  });

  it('sets and gets a single result, tracking metadata', async () => {
    const cache = createResultCache(driver);

    await cache.set('hash1', { success: true });
    expect(await cache.has('hash1')).toBe(true);

    const res = await cache.get('hash1');
    expect(res).toEqual({ success: true });

    await new Promise((r) => setTimeout(r, 10));

    const meta = await driver.get('hash1.meta');
    expect(meta).toBeDefined();
    expect(meta.hits).toBe(1);
  });

  it('supports bulk getMany and setMany', async () => {
    const cache = createResultCache(driver);

    await cache.setMany([
      ['taskA', 10],
      ['taskB', 20],
    ]);

    const has = await cache.hasMany(['taskA', 'taskB', 'taskC']);
    expect(has.has('taskA')).toBe(true);
    expect(has.has('taskB')).toBe(true);
    expect(has.has('taskC')).toBe(false);

    const results = await cache.getMany(['taskA', 'taskB', 'taskC']);
    expect(results.get('taskA')).toBe(10);
    expect(results.get('taskB')).toBe(20);
    expect(results.has('taskC')).toBe(false);
  });

  it('can retrieve entries with metadata directly', async () => {
    const cache = createResultCache(driver);

    await cache.set('taskX', 'foo');
    const entry = await cache.getWithMetadata('taskX');

    expect(entry).toBeDefined();
    expect(entry!.result).toBe('foo');
    expect(entry!.metadata.taskId).toBe('taskX');
    expect(entry!.metadata.hits).toBe(0);
  });
});
