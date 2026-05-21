import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';
import { registerInitCommand } from '../../src/commands/init.js';
import * as configModule from '@ngcompass/config';
import * as reportersModule from '@ngcompass/reporters';

vi.mock('@ngcompass/config');
vi.mock('@ngcompass/reporters');

describe('Init Command', () => {
    let program: Command;
    let mockExit: any;
    let mockConsoleError: any;
    let mockRenderInitResult: any;

    beforeEach(() => {
        vi.resetAllMocks();
        program = new Command();
        
        mockRenderInitResult = vi.fn().mockResolvedValue(undefined);
        vi.spyOn(reportersModule, 'getConfigReporter').mockReturnValue({
            renderInitResult: mockRenderInitResult
        } as any);

        mockExit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
        mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    it('registers the command to the program', () => {
        registerInitCommand(program, {} as any);
        expect(program.commands.length).toBe(1);
        expect(program.commands[0].name()).toBe('init');
    });

    it('executes initConfig and calls reporter on success', async () => {
        registerInitCommand(program, {} as any);
        
        vi.spyOn(configModule, 'initConfig').mockResolvedValue({
            success: true,
            alreadyExists: false,
            path: '/foo/ngcompass.config.ts'
        });

        await program.parseAsync(['node', 'test', 'init']);

        expect(configModule.initConfig).toHaveBeenCalledWith(expect.objectContaining({
            cwd: process.cwd(),
            force: undefined
        }));
        
        expect(mockRenderInitResult).toHaveBeenCalledWith(expect.objectContaining({
            success: true
        }));
        expect(mockExit).not.toHaveBeenCalled();
    });

    it('exits with 1 on unexpected failure', async () => {
        registerInitCommand(program, {} as any);
        
        vi.spyOn(configModule, 'initConfig').mockResolvedValue({
            success: false,
            alreadyExists: false,
            path: ''
        });

        await program.parseAsync(['node', 'test', 'init']);

        expect(mockExit).toHaveBeenCalledWith(1);
    });

    it('catches and logs generic errors', async () => {
        registerInitCommand(program, {} as any);
        
        vi.spyOn(configModule, 'initConfig').mockRejectedValue(new Error('Boom'));

        await program.parseAsync(['node', 'test', 'init']);

        expect(mockConsoleError).toHaveBeenCalled();
        const errorArg = String(mockConsoleError.mock.calls[0][0]);
        expect(errorArg).toContain('Boom');
        expect(mockExit).toHaveBeenCalledWith(1);
    });
});
