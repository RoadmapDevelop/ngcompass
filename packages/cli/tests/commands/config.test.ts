import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';
import { registerConfigCommand } from '../../src/commands/config.js';
import * as configModule from '@ngcompass/config';
import * as reportersModule from '@ngcompass/reporters';

vi.mock('@ngcompass/config');
vi.mock('@ngcompass/reporters');

describe('Config Command', () => {
  let program: Command;
  let mockExit: any;
  let mockConsoleError: any;
  let mockRenderHealthReport: any;

  beforeEach(() => {
    vi.resetAllMocks();
    program = new Command();

    mockRenderHealthReport = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(reportersModule, 'getConfigReporter').mockReturnValue({
      renderHealthReport: mockRenderHealthReport,
    } as any);

    mockExit = vi
      .spyOn(process, 'exit')
      .mockImplementation(() => undefined as never);
    mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('registers the health subcommand', () => {
    registerConfigCommand(program, {} as any);
    expect(program.commands.length).toBe(1);
    const configCmd = program.commands[0];
    expect(configCmd.name()).toBe('config');
    expect(configCmd.commands.length).toBe(1);
    expect(configCmd.commands[0].name()).toBe('health');
  });

  it('validates config and exits 0 if valid', async () => {
    registerConfigCommand(program, {} as any);

    vi.spyOn(configModule, 'validateConfig').mockResolvedValue({
      report: { valid: true },
    } as any);

    await program.parseAsync(['node', 'test', 'config', 'health']);

    expect(configModule.validateConfig).toHaveBeenCalled();
    expect(mockRenderHealthReport).toHaveBeenCalledWith({ valid: true });
    expect(mockExit).not.toHaveBeenCalled();
  });

  it('validates config and exits 1 if invalid', async () => {
    registerConfigCommand(program, {} as any);

    vi.spyOn(configModule, 'validateConfig').mockResolvedValue({
      report: { valid: false },
    } as any);

    await program.parseAsync(['node', 'test', 'config', 'health']);

    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it('handles unexpected validation errors gracefully', async () => {
    registerConfigCommand(program, {} as any);

    vi.spyOn(configModule, 'validateConfig').mockRejectedValue(
      new Error('Validation Crash')
    );

    await program.parseAsync(['node', 'test', 'config', 'health']);

    expect(mockConsoleError).toHaveBeenCalled();
    const errorArg = String(mockConsoleError.mock.calls[0][0]);
    expect(errorArg).toContain('Validation Crash');
    expect(mockExit).toHaveBeenCalledWith(1);
  });
});
