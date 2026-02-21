import { describe, it, expect, beforeEach } from 'vitest';
import { createPlanCache } from '../../../src/cache/services/plan-cache.js';
import type { AsyncDriver } from '../../../src/cache/drivers/types.js';

// ---------------------------------------------------------------------------
// In-memory stub driver
// The plan cache is intentionally opaque (stores serialised CompactPlan as
// unknown), so the test just uses plain objects as stand-ins.
// ---------------------------------------------------------------------------
function makeStubDriver(): AsyncDriver<unknown> {
    const store = new Map<string, unknown>();
    return {
        get: async (key) => store.get(key),
        set: async (key, value) => { store.set(key, value); },
        has: async (key) => store.has(key),
        delete: async (key) => { store.delete(key); },
        clear: async () => { store.clear(); },
        getStats: async () => ({ entries: store.size, size: 0 }),
    };
}

// Simulate the CompactPlan shape the planner actually stores
const makeCompactPlan = (id: string) => ({ v: 1, r: [id], o: [], f: [], h: [], t: [] });

// ---------------------------------------------------------------------------
// createPlanCache
// ---------------------------------------------------------------------------
describe('createPlanCache', () => {
    let driver: AsyncDriver<unknown>;
    let cache: ReturnType<typeof createPlanCache>;

    beforeEach(() => {
        driver = makeStubDriver();
        cache = createPlanCache(driver);
    });

    it('set and get round-trip returns the same stored value', async () => {
        const plan = makeCompactPlan('rule-a');
        await cache.set('plan-key', plan);
        expect(await cache.get('plan-key')).toEqual(plan);
    });

    it('get returns undefined for an unknown key', async () => {
        expect(await cache.get('ghost')).toBeUndefined();
    });

    it('delete() removes the stored plan', async () => {
        await cache.set('k', makeCompactPlan('r'));
        await cache.delete('k');
        expect(await cache.get('k')).toBeUndefined();
    });

    it('stores multiple plans under different keys', async () => {
        const p1 = makeCompactPlan('rule-a');
        const p2 = makeCompactPlan('rule-b');
        await cache.set('k1', p1);
        await cache.set('k2', p2);
        expect(await cache.get('k1')).toEqual(p1);
        expect(await cache.get('k2')).toEqual(p2);
    });

    it('overwrites an existing plan', async () => {
        await cache.set('k', makeCompactPlan('old'));
        const updated = makeCompactPlan('new');
        await cache.set('k', updated);
        expect(await cache.get('k')).toEqual(updated);
    });
});
