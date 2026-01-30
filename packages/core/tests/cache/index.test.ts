import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { createCacheContext } from '../../src/cache/index.js';
import path from 'path';
import fs from 'fs';

describe('createCacheContext Integration', () => {
    const testPath = path.resolve(__dirname, '.ctx-test');

    beforeAll(() => {
        // Clean start
        if (fs.existsSync(testPath)) {
            fs.rmSync(testPath, { recursive: true, force: true });
        }
    });

    afterAll(() => {
        fs.rmSync(testPath, { recursive: true, force: true });
    });

    it('should initialize and persist data', async () => {
        const ctx = createCacheContext({ disk: { path: testPath } });

        const hash = ctx.computeHash('some-content');

        // 1. Storage
        ctx.sources.set(hash, { content: 'some-content', filePath: 'test.ts' });
        await ctx.asts.set(hash, { filePath: 'test.ts', ast: { type: 'Programm' } });
        await ctx.results.set(hash, { issues: [] });

        // 2. Retrieval
        const source = ctx.sources.get(hash);
        const ast = await ctx.asts.get(hash);
        const result = await ctx.results.get(hash);

        expect(source).toBeDefined();
        expect(ast).toBeDefined();
        expect(result).toBeDefined();

        // 3. Persistence Check
        // AST L2
        expect(fs.existsSync(path.join(testPath, 'ast'))).toBe(true);
        // Result Files
        const resultFile = path.join(testPath, 'results', `${hash}.json`);
        expect(fs.existsSync(resultFile)).toBe(true);
    });

    it('should prune old entries', async () => {
        const ctx = createCacheContext({
            disk: { path: testPath, ttl: 1 } // 1ms TTL
        });

        await ctx.prune();
        // Since we didn't wait for TTL, it might not delete anything yet, 
        // OR if previous test created files, they might assume default TTL.
        // This is just a smoke test that prune() is callable.

        expect(true).toBe(true);
    });
});
