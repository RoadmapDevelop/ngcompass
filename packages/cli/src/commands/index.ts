/**
 * @fileoverview
 * Aggregates every CLI command registration into a single entry point.
 *
 * `registerCommands()` is called once from the binary; each per-command file
 * owns its own option parsing, action handler, and exit semantics.
 */

import { Command } from 'commander';
import { registerInitCommand } from './init.js';
import { registerAnalyzeCommand } from './analyze.js';
import { registerConfigCommand } from './config.js';
import { registerCacheCommand } from './cache.js';
import { registerRulesCommand } from './rules.js';
import { CacheContext } from '@ngcompass/cache';


export function registerCommands(program: Command, cache: CacheContext) {
    registerInitCommand(program, cache);
    registerAnalyzeCommand(program, cache);
    registerConfigCommand(program, cache);
    registerCacheCommand(program, cache);
    registerRulesCommand(program);
}
