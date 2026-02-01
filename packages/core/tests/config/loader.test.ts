import { describe, it, expect, vi, afterEach } from 'vitest';
import { DEFAULT_CONFIG, DEFAULT_CACHE_OPTIONS } from '../../src/config/schemas/defaults.js';
import { resolveConfig } from '../../src/config/loaders/loader.js';
import path from 'path';
import fs from 'fs';

describe('ConfigLoader', () => {
    const tempDir = path.resolve(__dirname, '.config-test');

    afterEach(() => {
        vi.restoreAllMocks();
        if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    });

    const createConfigFile = (filename: string, content: string) => {
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }
        fs.writeFileSync(path.join(tempDir, filename), content);
    };

    it('should return defaults when no config found', async () => {
        const result = await resolveConfig({ cwd: tempDir });
        const config = result.config!;

        expect(config.include).toEqual(DEFAULT_CONFIG.include);
        expect(config.cache.strategy).toBe('local');
        expect(config.maxWorkers).toBeGreaterThan(0);
    });

    it('should normalize concurrency alias', async () => {
        createConfigFile('ngcompass.config.json', JSON.stringify({
            concurrency: 42
        }));

        const result = await resolveConfig({ cwd: tempDir });
        const config = result.config!;
        expect(config.maxWorkers).toBe(42);
    });

    it('should normalize cache boolean shortcut', async () => {
        createConfigFile('ngcompass.config.json', JSON.stringify({
            cache: true
        }));

        const result = await resolveConfig({ cwd: tempDir });
        const config = result.config!;
        expect(config.cache.enabled).toBe(true);
        expect(config.cache.location).toBe(DEFAULT_CACHE_OPTIONS.location);
    });

    it('should normalize legacy cacheLocation', async () => {
        createConfigFile('ngcompass.config.json', JSON.stringify({
            cacheLocation: '.custom-cache'
        }));

        const result = await resolveConfig({ cwd: tempDir });
        const config = result.config!;
        expect(config.cache.location).toBe('.custom-cache');
    });

    it('should merge profile configuration', async () => {
        createConfigFile('ngcompass.config.json', JSON.stringify({
            maxWorkers: 1,
            profiles: {
                dev: {
                    maxWorkers: 5,
                    watch: true
                }
            }
        }));

        const result = await resolveConfig({ cwd: tempDir, profile: 'dev' });
        const config = result.config!;
        expect(config.maxWorkers).toBe(5);
        expect(config.watch).toBe(true);
    });

    it('should throw error for unknown profile', async () => {
        createConfigFile('ngcompass.config.json', JSON.stringify({
            profiles: { ci: {} }
        }));

        const result = await resolveConfig({ cwd: tempDir, profile: 'dev' });
        expect(result.report.valid).toBe(false);
        expect(result.report.errors[0]).toMatch(/Profile "dev" not found/);
    });

    it('should throw validation error for invalid values', async () => {
        createConfigFile('ngcompass.config.json', JSON.stringify({
            severity: 'super-critical' // Invalid enum
        }));

        const result = await resolveConfig({ cwd: tempDir });
        expect(result.report.valid).toBe(false);
        expect(result.report.errors.length).toBeGreaterThan(0);
    });
});
