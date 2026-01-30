import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createResultCache } from '../../../src/cache/services/result-cache.js';

describe('createResultCache', () => {
    // We can mock the driver entirely
    const mockDriver = {
        get: vi.fn(),
        set: vi.fn(),
        has: vi.fn(),
        delete: vi.fn(),
        clear: vi.fn(),
    };

    let resultCache: ReturnType<typeof createResultCache>;

    beforeEach(() => {
        vi.resetAllMocks();
        resultCache = createResultCache(mockDriver as any);
    });

    it('should delegate set to driver', async () => {
        await resultCache.set('hash1', { analysis: 'ok' });
        expect(mockDriver.set).toHaveBeenCalledWith('hash1', { analysis: 'ok' });
    });

    it('should delegate get to driver', async () => {
        mockDriver.get.mockResolvedValue({ analysis: 'ok' });
        const result = await resultCache.get('hash1');
        expect(result).toEqual({ analysis: 'ok' });
        expect(mockDriver.get).toHaveBeenCalledWith('hash1');
    });
});
