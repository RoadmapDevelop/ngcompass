import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveConfig } from '../../src/config/loaders/loader.js';
import { createCacheContext } from '../../src/cache/index.js';
import * as discovery from '../../src/config/loaders/discovery.js';
import * as health from '../../src/config/health/index.js';
import fs from 'node:fs';
import path from 'node:path';

// Mock discovery and health
vi.mock('../../src/config/loaders/discovery.js');
vi.mock('../../src/config/health/index.js');

describe('resolveConfig with Caching', () => {
    const testCachePath = path.resolve(process.cwd(), '.test-cache-config');
    let cache: any;

    beforeEach(async () => {
        vi.clearAllMocks();
        if (fs.existsSync(testCachePath)) {
            fs.rmSync(testCachePath, { recursive: true, force: true });
        }
        cache = createCacheContext({
            disk: { path: testCachePath }
        });
        await cache.clear();
    });

    it('should perform validation and store in cache on first run', async () => {
        const mockConfig = { include: ['src/**/*.ts'] };
        const mockReport = { valid: true, errors: [], warnings: [] };

        vi.mocked(discovery.findAndLoadConfig).mockResolvedValue({
            config: mockConfig,
            filepath: 'ngcompass.config.json'
        });

        vi.mocked(health.validateConfiguration).mockResolvedValue({ report: mockReport });

        // 1. First Run
        const result1 = await resolveConfig({ cache });
        expect(result1.report).toEqual(mockReport);
        expect(health.validateConfiguration).toHaveBeenCalledTimes(1);

        // 2. Second Run (Same Config)
        const result2 = await resolveConfig({ cache });
        expect(result2.report).toEqual(mockReport);
        // Should NOT call validateConfiguration again
        expect(health.validateConfiguration).toHaveBeenCalledTimes(1);
    });

    it('should re-validate if configuration changes', async () => {
        const mockConfig1 = { include: ['src/**/*.ts'] };
        const mockConfig2 = { include: ['src/**/*.ts'], exclude: ['dist'] };
        const mockReport = { valid: true, errors: [], warnings: [] };

        vi.mocked(health.validateConfiguration).mockResolvedValue({ report: mockReport });

        // 1. Run with Config 1
        vi.mocked(discovery.findAndLoadConfig).mockResolvedValue({
            config: mockConfig1,
            filepath: 'ngcompass.config.json'
        });
        await resolveConfig({ cache });
        expect(health.validateConfiguration).toHaveBeenCalledTimes(1);

        // 2. Run with Config 2
        vi.mocked(discovery.findAndLoadConfig).mockResolvedValue({
            config: mockConfig2,
            filepath: 'ngcompass.config.json'
        });
        await resolveConfig({ cache });
        // Should call validateConfiguration again because hash changed
        expect(health.validateConfiguration).toHaveBeenCalledTimes(2);
    });

    it('should not use cache if no cache context is provided', async () => {
        const mockConfig = { include: ['src/**/*.ts'] };
        const mockReport = { valid: true, errors: [], warnings: [] };

        vi.mocked(discovery.findAndLoadConfig).mockResolvedValue({
            config: mockConfig,
            filepath: 'ngcompass.config.json'
        });
        vi.mocked(health.validateConfiguration).mockResolvedValue({ report: mockReport });

        await resolveConfig({});
        await resolveConfig({});

        expect(health.validateConfiguration).toHaveBeenCalledTimes(2);
    });
});
