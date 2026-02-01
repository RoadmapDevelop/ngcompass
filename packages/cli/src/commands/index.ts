import { Command } from 'commander';
import { registerInitCommand } from './init.js';
import { registerAnalyzeCommand } from './analyze.js';
import { registerConfigCommand } from './config.js';
import { CacheContext } from '@ngcompass/core';

/**
 * Registers all CLI commands.
 */
export function registerCommands(program: Command, cache: CacheContext) {
    registerInitCommand(program, cache);
    registerAnalyzeCommand(program, cache);
    registerConfigCommand(program, cache);
}
