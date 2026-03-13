import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';
import { registerCacheCommand } from '../../src/commands/cache.js';
import * as reportersModule from '@ngcompass/reporters';

vi.mock('@ngcompass/reporters');

describe('Cache Command', () => {
    let program: Command;
    let cache: any;
    let mockExit: any;
    let mockConsoleError: any;
    let mockConsoleLog: any;
    let mockReporter: any;

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

        mockExit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
        mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
        mockConsoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
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

        expect(cache.clear).toHaveBeenCalled();
        expect(mockReporter.renderClearResult).toHaveBeenCalledWith('all');
        expect(mockExit).not.toHaveBeenCalled();
    });

    it('clears specific caches when type!=all', async () => {
        registerCacheCommand(program, cache);
        await program.parseAsync(['node', 'test', 'cache', 'clear', '--type', 'ast']);

        expect(cache.clearType).toHaveBeenCalledWith('ast');
        expect(mockReporter.renderClearResult).toHaveBeenCalledWith('ast');
        expect(mockExit).not.toHaveBeenCalled();
    });

    it('rejects invalid cache types', async () => {
        registerCacheCommand(program, cache);
        await program.parseAsync(['node', 'test', 'cache', 'clear', '--type', 'invalid_type']);

        expect(mockConsoleError).toHaveBeenCalled();
        expect(mockExit).toHaveBeenCalledWith(1);
        expect(cache.clear).not.toHaveBeenCalled();
    });

    it('prints cache info', async () => {
        registerCacheCommand(program, cache);
        await program.parseAsync(['node', 'test', 'cache', 'info']);

        expect(cache.getInfo).toHaveBeenCalled();
        expect(mockReporter.renderCacheInfo).toHaveBeenCalledWith({ totalSize: 100 });
        expect(mockExit).not.toHaveBeenCalled();
    });

    it('prints cache path', async () => {
        registerCacheCommand(program, cache);
        await program.parseAsync(['node', 'test', 'cache', 'path']);

        expect(cache.getCachePath).toHaveBeenCalled();
        expect(mockConsoleLog).toHaveBeenCalledWith('/my/cache/path');
        expect(mockExit).not.toHaveBeenCalled();
    });
});
