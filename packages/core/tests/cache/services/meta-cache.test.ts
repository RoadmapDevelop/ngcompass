import { describe, it, expect, beforeEach } from 'vitest';
import { createMetaCache } from '../../../src/cache/services/meta-cache.js';
import type { FileMeta } from '../../../src/cache/services/meta-cache.js';
import type { AsyncDriver, AsyncDriverWithFlush } from '../../../src/cache/drivers/types.js';

// ---------------------------------------------------------------------------
// Stub drivers
// ---------------------------------------------------------------------------
function makeStubDriver(): AsyncDriver<FileMeta> {
    const store = new Map<string, FileMeta>();
    return {
        get: async (key) => store.get(key),
        set: async (key, value) => { store.set(key, value); },
        has: async (key) => store.has(key),
        delete: async (key) => { store.delete(key); },
        clear: async () => { store.clear(); },
        getStats: async () => ({ entries: store.size, size: 0 }),
    };
}

function makeFlushableDriver(): AsyncDriverWithFlush<FileMeta> & { flushed: boolean } {
    const store = new Map<string, FileMeta>();
    let flushed = false;
    return {
        get: async (key) => store.get(key),
        set: async (key, value) => { store.set(key, value); },
        has: async (key) => store.has(key),
        delete: async (key) => { store.delete(key); },
        clear: async () => { store.clear(); },
        getStats: async () => ({ entries: store.size, size: 0 }),
        flush: async () => { flushed = true; },
        get flushed() { return flushed; },
    };
}

const makeMeta = (overrides: Partial<FileMeta> = {}): FileMeta => ({
    mtime: Date.now(),
    size: 1024,
    hash: 'abc123',
    ...overrides,
});

// ---------------------------------------------------------------------------
// createMetaCache
// ---------------------------------------------------------------------------
describe('createMetaCache', () => {
    let driver: AsyncDriver<FileMeta>;
    let cache: ReturnType<typeof createMetaCache>;

    beforeEach(() => {
        driver = makeStubDriver();
        cache = createMetaCache(driver);
    });

    it('set and get round-trip returns the same meta', async () => {
        const meta = makeMeta({ hash: 'def456' });
        await cache.set('/path/to/file.ts', meta);
        expect(await cache.get('/path/to/file.ts')).toEqual(meta);
    });

    it('get returns undefined for an unknown path', async () => {
        expect(await cache.get('/unknown.ts')).toBeUndefined();
    });

    it('delete() removes the entry', async () => {
        await cache.set('/file.ts', makeMeta());
        await cache.delete('/file.ts');
        expect(await cache.get('/file.ts')).toBeUndefined();
    });

    it('flush() is a no-op when driver has no flush method', async () => {
        // Plain driver — no flush property
        await expect(cache.flush()).resolves.toBeUndefined();
    });

    it('flush() calls driver.flush() when driver implements AsyncDriverWithFlush', async () => {
        const flushable = makeFlushableDriver();
        const flushableCache = createMetaCache(flushable);
        await flushableCache.set('/a.ts', makeMeta());
        await flushableCache.flush();
        expect(flushable.flushed).toBe(true);
    });

    it('stores different metas per file path', async () => {
        const m1 = makeMeta({ hash: 'h1', size: 100 });
        const m2 = makeMeta({ hash: 'h2', size: 200 });
        await cache.set('/a.ts', m1);
        await cache.set('/b.ts', m2);
        expect((await cache.get('/a.ts'))?.hash).toBe('h1');
        expect((await cache.get('/b.ts'))?.hash).toBe('h2');
    });
});
