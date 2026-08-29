import { describe, it, expect, vi } from 'vitest';
import { createAstCache, AstEntry } from '../../src/caches/ast-cache.js';
import { SyncDriver, AsyncDriver } from '../../src/drivers/types.js';

describe('createAstCache', () => {
  it('promotes L2 to L1 on cache miss', async () => {
    const l1Store = new Map<string, any>();
    const l1: SyncDriver<any> = {
      get: (k) => l1Store.get(k),
      set: (k, v) => l1Store.set(k, v),
      has: (k) => l1Store.has(k),
      delete: (k) => l1Store.delete(k),
      clear: () => l1Store.clear(),
      getStats: () => ({ entries: l1Store.size, size: 0 }),
    };

    const l2Store = new Map<string, any>();
    const l2: AsyncDriver<any> = {
      get: async (k) => l2Store.get(k),
      set: async (k, v) => {
        l2Store.set(k, v);
      },
      has: async (k) => l2Store.has(k),
      delete: async (k) => {
        l2Store.delete(k);
      },
      clear: async () => {
        l2Store.clear();
      },
      getStats: async () => ({ entries: l2Store.size, size: 0 }),
    };

    const cache = createAstCache(l1, l2);

    const entry: AstEntry = { filePath: '/file.ts', ast: {} };
    await l2.set('hash1', entry);

    expect(l1.has('hash1')).toBe(false);

    const result = await cache.get('hash1');
    expect(result).toEqual(entry);
    expect(l1.has('hash1')).toBe(true);
  });

  it('writes to both L1 and L2 on set', async () => {
    const l1Store = new Map<string, any>();
    const l1: SyncDriver<any> = {
      get: (k) => l1Store.get(k),
      set: (k, v) => l1Store.set(k, v),
      has: (k) => l1Store.has(k),
      delete: (k) => l1Store.delete(k),
      clear: () => l1Store.clear(),
      getStats: () => ({ entries: l1Store.size, size: 0 }),
    };

    const l2Store = new Map<string, any>();
    const l2: AsyncDriver<any> = {
      get: async (k) => l2Store.get(k),
      set: async (k, v) => {
        l2Store.set(k, v);
      },
      has: async (k) => l2Store.has(k),
      delete: async (k) => {
        l2Store.delete(k);
      },
      clear: async () => {
        l2Store.clear();
      },
      getStats: async () => ({ entries: l2Store.size, size: 0 }),
    };

    const cache = createAstCache(l1, l2);
    const entry: AstEntry = { filePath: '/new.ts', ast: {} };

    await cache.set('hash2', entry);
    expect(l1.has('hash2')).toBe(true);
    expect(await l2.has('hash2')).toBe(true);
  });
});
