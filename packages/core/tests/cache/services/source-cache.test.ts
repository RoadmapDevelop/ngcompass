import { describe, it, expect, beforeEach } from 'vitest';
import { createSourceCache } from '../../../src/cache/services/source-cache.js';
import { createMemoryDriver } from '../../../src/cache/drivers/memory.js';

describe('createSourceCache', () => {
    let sourceCache: ReturnType<typeof createSourceCache>;
    let memoryDriver: ReturnType<typeof createMemoryDriver<any>>;

    beforeEach(() => {
        memoryDriver = createMemoryDriver();
        sourceCache = createSourceCache(memoryDriver);
    });

    it('should set and get sources', () => {
        sourceCache.set('hash1', { content: 'code', filePath: 'app.ts' });

        const result = sourceCache.get('hash1');
        expect(result).toEqual({ content: 'code', filePath: 'app.ts' });
    });

    it('should return undefined for missing sources', () => {
        expect(sourceCache.get('missing')).toBeUndefined();
    });
});
