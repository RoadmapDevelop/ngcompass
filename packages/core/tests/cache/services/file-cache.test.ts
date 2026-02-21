import { describe, it, expect, beforeEach } from 'vitest';
import { createFileCache } from '../../../src/cache/services/file-cache.js';
import type { FileCacheEntry } from '../../../src/cache/services/file-cache.js';
import type { AsyncDriver } from '../../../src/cache/drivers/types.js';

// ---------------------------------------------------------------------------
// In-memory stub driver
// ---------------------------------------------------------------------------
function makeStubDriver(): AsyncDriver<FileCacheEntry> {
    const store = new Map<string, FileCacheEntry>();
    return {
        get: async (key) => store.get(key),
        set: async (key, value) => { store.set(key, value); },
        has: async (key) => store.has(key),
        delete: async (key) => { store.delete(key); },
        clear: async () => { store.clear(); },
        getStats: async () => ({ entries: store.size, size: 0 }),
    };
}

// ---------------------------------------------------------------------------
// createFileCache
// ---------------------------------------------------------------------------
describe('createFileCache', () => {
    let driver: AsyncDriver<FileCacheEntry>;
    let cache: ReturnType<typeof createFileCache>;

    beforeEach(() => {
        driver = makeStubDriver();
        cache = createFileCache(driver);
    });

    it('set stores files and a timestamp, get retrieves them', async () => {
        const before = Date.now();
        await cache.set('scope-key', ['/a.ts', '/b.ts']);
        const entry = await cache.get('scope-key');
        const after = Date.now();

        expect(entry).toBeDefined();
        expect(entry!.files).toEqual(['/a.ts', '/b.ts']);
        expect(entry!.timestamp).toBeGreaterThanOrEqual(before);
        expect(entry!.timestamp).toBeLessThanOrEqual(after);
    });

    it('get returns undefined for an unknown key', async () => {
        expect(await cache.get('ghost')).toBeUndefined();
    });

    it('set overwrites an existing entry with fresh files and timestamp', async () => {
        await cache.set('k', ['/old.ts']);
        await cache.set('k', ['/new.ts']);
        const entry = await cache.get('k');
        expect(entry!.files).toEqual(['/new.ts']);
    });

    it('stores multiple entries under different keys', async () => {
        await cache.set('scope1', ['/a.ts']);
        await cache.set('scope2', ['/b.ts', '/c.ts']);
        expect((await cache.get('scope1'))!.files).toEqual(['/a.ts']);
        expect((await cache.get('scope2'))!.files).toHaveLength(2);
    });

    it('stores an empty file list without error', async () => {
        await cache.set('empty', []);
        const entry = await cache.get('empty');
        expect(entry!.files).toEqual([]);
    });
});
