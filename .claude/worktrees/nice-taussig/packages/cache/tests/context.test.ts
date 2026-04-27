import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { getCacheContext, createCacheContext, resetGlobalCache } from '../src/context.js';
import { CACHE_VERSION } from '../src/constants.js';
import path from 'path';

describe('CacheContext', () => {
    beforeEach(() => {
        resetGlobalCache();
    });

    it('creates a fully initialized CacheContext', () => {
        const ctx = createCacheContext();

        expect(ctx.sources).toBeDefined();
        expect(ctx.asts).toBeDefined();
        expect(ctx.results).toBeDefined();
        expect(ctx.configs).toBeDefined();
        expect(ctx.metas).toBeDefined();
        expect(ctx.plans).toBeDefined();
        expect(ctx.files).toBeDefined();
        expect(ctx.analysis).toBeDefined();

        expect(typeof ctx.computeHash).toBe('function');
        expect(typeof ctx.prune).toBe('function');
    });

    it('getCacheContext returns a singleton', () => {
        const ctx1 = getCacheContext();
        const ctx2 = getCacheContext();

        expect(ctx1).toBe(ctx2);
    });

    it('getCachePath resolves the correct path', () => {
        const customPath = '/custom/cache/dir';
        const ctx = createCacheContext({ disk: { path: customPath } });
        
        expect(ctx.getCachePath()).toBe(customPath);
    });

    it('getInfo returns unified driver stats', async () => {
        const ctx = createCacheContext();
        const info = await ctx.getInfo();

        expect(info.version).toBe(CACHE_VERSION);
        expect(info.totalSize).toBeDefined();
        expect(info.ast.l1.maxEntries).toBe(200);
        expect(info.ast.l1.entries).toBe(0);
        expect(info.results.entries).toBe(0);
    });

    it('clearAllDrivers behaves gracefully on fresh context', async () => {
        const ctx = createCacheContext();
        // Just verify it doesn't throw since we have empty memory drivers and unwritten disk drivers
        await expect(ctx.clear()).resolves.not.toThrow();
    });
});
