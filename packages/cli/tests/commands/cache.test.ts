import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';
import { registerCacheCommand } from '../../src/commands/cache.js';
import * as reportersModule from '@ngcompass/reporters';
import * as configModule from '@ngcompass/config';
import * as cacheModule from '@ngcompass/cache';

vi.mock('@ngcompass/reporters');
vi.mock('@ngcompass/config');

describe('Cache Command', () => {
    let program: Command;
    let cache: any;
    let runtimeCache: any;
    let mockExit: any;
    let mockConsoleError: any;
    let mockReporter: any;
    let mockStdoutWrite: any;

    beforeEach(() => {
        vi.resetAllMocks();
        program = new Command();
        
        mockReporter = {
            renderClearResult: vi.fn(),
            renderCacheInfo: vi.fn()
        };
        
        vi.spyOn(reportersModule, 'getCacheReporter').mockReturnValue(mockReporter);

        cache = {
            clear: vi.fn().mockResolvedValue(undefined),
            clearType: vi.fn().mockResolvedValue(undefined),
            getInfo: vi.fn().mockResolvedValue({ totalSize: 100 }),
            getCachePath: vi.fn().mockReturnValue('/my/cache/path')
        };
        runtimeCache = {
            clear: vi.fn().mockResolvedValue(undefined),
            clearType: vi.fn().mockResolvedValue(undefined),
            getInfo: vi.fn().mockResolvedValue({ totalSize: 200 }),
            getCachePath: vi.fn().mockReturnValue('/configured/cache/path')
        };

        vi.spyOn(configModule, 'resolveConfig').mockResolvedValue({
            report: { valid: true },
            config: {
                cache: {
                    enabled: true,
                    location: '.cache/custom',
                    strategy: 'local',
                    ttl: 1000
                }
            }
        } as any);
        vi.spyOn(cacheModule, 'createRuntimeCache').mockReturnValue(runtimeCache as any);

        mockExit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
        mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
        mockStdoutWrite = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    });

    it('registers cache subcommands', () => {
        registerCacheCommand(program, cache);
        expect(program.commands.length).toBe(1);
        
        const cacheCmd = program.commands[0];
        expect(cacheCmd.name()).toBe('cache');
        expect(cacheCmd.commands.map(c => c.name())).toEqual(['clear', 'info', 'path']);
    });

    it('clears all caches when type=all', async () => {
        registerCacheCommand(program, cache);
        await program.parseAsync(['node', 'test', 'cache', 'clear', '--type', 'all']);

        expect(runtimeCache.clear).toHaveBeenCalled();
        expect(mockReporter.renderClearResult).toHaveBeenCalledWith('all');
        expect(mockExit).not.toHaveBeenCalled();
    });

    it('clears specific caches when type!=all', async () => {
        registerCacheCommand(program, cache);
        await program.parseAsync(['node', 'test', 'cache', 'clear', '--type', 'ast']);

        expect(runtimeCache.clearType).toHaveBeenCalledWith('ast');
        expect(mockReporter.renderClearResult).toHaveBeenCalledWith('ast');
        expect(mockExit).not.toHaveBeenCalled();
    });

    it('rejects invalid cache types', async () => {
        registerCacheCommand(program, cache);
        await program.parseAsync(['node', 'test', 'cache', 'clear', '--type', 'invalid_type']);

        expect(mockConsoleError).toHaveBeenCalled();
        expect(mockExit).toHaveBeenCalledWith(1);
        expect(runtimeCache.clear).not.toHaveBeenCalled();
    });

    it('prints cache info', async () => {
        registerCacheCommand(program, cache);
        await program.parseAsync(['node', 'test', 'cache', 'info']);

        expect(runtimeCache.getInfo).toHaveBeenCalled();
        expect(mockReporter.renderCacheInfo).toHaveBeenCalledWith({ totalSize: 200 });
        expect(mockExit).not.toHaveBeenCalled();
    });

    it('prints cache path', async () => {
        registerCacheCommand(program, cache);
        await program.parseAsync(['node', 'test', 'cache', 'path']);

        expect(runtimeCache.getCachePath).toHaveBeenCalled();
        expect(mockStdoutWrite).toHaveBeenCalledWith('/configured/cache/path\n');
        expect(mockExit).not.toHaveBeenCalled();
    });

    it('falls back to the startup cache when config resolution is invalid', async () => {
        vi.spyOn(configModule, 'resolveConfig').mockResolvedValue({
            report: { valid: false },
            config: undefined
        } as any);

        registerCacheCommand(program, cache);
        await program.parseAsync(['node', 'test', 'cache', 'path']);

        expect(cache.getCachePath).toHaveBeenCalled();
        expect(mockStdoutWrite).toHaveBeenCalledWith('/my/cache/path\n');
    });
});
