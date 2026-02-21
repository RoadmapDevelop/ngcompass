import { describe, it, expect, beforeEach } from 'vitest';
import { createConfigCache } from '../../../src/cache/services/config-cache.js';
import type { AsyncDriver } from '../../../src/cache/drivers/types.js';
import type { ConfigValidationResult } from '@ngcompass/common';

// ---------------------------------------------------------------------------
// In-memory stub driver
// ---------------------------------------------------------------------------
function makeStubDriver(): AsyncDriver<ConfigValidationResult> {
    const store = new Map<string, ConfigValidationResult>();
    return {
        get: async (key) => store.get(key),
        set: async (key, value) => { store.set(key, value); },
        has: async (key) => store.has(key),
        delete: async (key) => { store.delete(key); },
        clear: async () => { store.clear(); },
        getStats: async () => ({ entries: store.size, size: 0 }),
    };
}

// Minimal valid ConfigValidationResult
const makeReport = (overrides: Partial<ConfigValidationResult> = {}): ConfigValidationResult => ({
    report: {
        isValid: true,
        errors: [],
        warnings: [],
        suggestions: [],
    } as unknown as ConfigValidationResult['report'],
    ...overrides,
});

// ---------------------------------------------------------------------------
// createConfigCache
// ---------------------------------------------------------------------------
describe('createConfigCache', () => {
    let driver: AsyncDriver<ConfigValidationResult>;
    let cache: ReturnType<typeof createConfigCache>;

    beforeEach(() => {
        driver = makeStubDriver();
        cache = createConfigCache(driver);
    });

    it('set and get round-trip returns the same report', async () => {
        const report = makeReport();
        await cache.set('abc123', report);
        expect(await cache.get('abc123')).toEqual(report);
    });

    it('get returns undefined for an unknown hash', async () => {
        expect(await cache.get('ghost')).toBeUndefined();
    });

    it('stores multiple reports under different hashes', async () => {
        const r1 = makeReport();
        const r2 = makeReport();
        await cache.set('h1', r1);
        await cache.set('h2', r2);
        expect(await cache.get('h1')).toEqual(r1);
        expect(await cache.get('h2')).toEqual(r2);
    });

    it('overwrites an existing entry', async () => {
        const old = makeReport();
        const fresh = { ...makeReport(), fresh: true } as unknown as ConfigValidationResult;
        await cache.set('h', old);
        await cache.set('h', fresh);
        expect(await cache.get('h')).toEqual(fresh);
    });
});
