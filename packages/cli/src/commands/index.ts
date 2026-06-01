import { Command } from 'commander';
import { registerInitCommand } from './init.js';
import { registerAnalyzeCommand } from './analyze/index.js';
import { registerConfigCommand } from './config.js';
import { registerCacheCommand } from './cache.js';
import { registerRulesCommand } from './rules.js';
import { CacheContext } from '@ngcompass/cache';

import { registerCircularCommand } from './circular.js';

export function registerCommands(program: Command, cache: CacheContext): void {
  registerInitCommand(program, cache);
  registerAnalyzeCommand(program, cache);
  registerConfigCommand(program, cache);
  registerCacheCommand(program, cache);
  registerRulesCommand(program);
  registerCircularCommand(program, cache);
}
