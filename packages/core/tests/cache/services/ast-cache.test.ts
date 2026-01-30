import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAstCache, AstEntry } from '../../../src/cache/services/ast-cache.js';
import { createMemoryDriver } from '../../../src/cache/drivers/memory.js';

describe('createAstCache', () => {
    const mockDiskDriver = {
        get: vi.fn(),
        set: vi.fn(),
        has: vi.fn(),
        delete: vi.fn(),
        clear: vi.fn(),
    };

    let memoryDriver: ReturnType<typeof createMemoryDriver<AstEntry>>;
    let astCache: ReturnType<typeof createAstCache>;

    beforeEach(() => {
        vi.resetAllMocks();
        memoryDriver = createMemoryDriver<AstEntry>();
        astCache = createAstCache(memoryDriver, mockDiskDriver);
    });

    it('should return from L1 if available (no L2 access)', async () => {
        memoryDriver.set('hash1', { filePath: 'f.ts', ast: { type: 'L1' } });

        const result = await astCache.get('hash1');

        expect(result).toEqual({ filePath: 'f.ts', ast: { type: 'L1' } });
        expect(mockDiskDriver.get).not.toHaveBeenCalled();
    });

    it('should promote from L2 to L1 on L1 miss', async () => {
        mockDiskDriver.get.mockResolvedValue({ filePath: 'f.ts', ast: { type: 'L2' } });

        const result = await astCache.get('hash1');

        expect(result).toEqual({ filePath: 'f.ts', ast: { type: 'L2' } });
        expect(memoryDriver.get('hash1')).toEqual({ filePath: 'f.ts', ast: { type: 'L2' } });
    });

    it('should return undefined if L1 and L2 miss', async () => {
        mockDiskDriver.get.mockResolvedValue(undefined);

        const result = await astCache.get('hash1');

        expect(result).toBeUndefined();
    });

    it('should set to both L1 and L2', async () => {
        const entry = { filePath: 'f.ts', ast: {} };
        await astCache.set('hash1', entry);

        expect(memoryDriver.get('hash1')).toEqual(entry);
        expect(mockDiskDriver.set).toHaveBeenCalledWith('hash1', entry);
    });

    it('should handle disk errors gracefully during get', async () => {
        // If disk throws, it should return undefined
        mockDiskDriver.get.mockRejectedValue(new Error('Corrupt'));

        const result = await astCache.get('hash1');

        expect(result).toBeUndefined();
    });
});
