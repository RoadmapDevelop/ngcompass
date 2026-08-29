import { Command } from 'commander';
import { registerInitCommand } from './init.js';
import { registerAnalyzeCommand } from './analyze/index.js';
import { registerConfigCommand } from './config.js';
import { registerCacheCommand } from './cache.js';
import { registerBaselineCommand } from './baseline.js';
import { registerRulesCommand } from './rules.js';
import { CacheContext } from '@ngcompass/cache';

import { registerCircularCommand } from './circular.js';
import { registerGraphCommand } from './graph.js';
import { registerComplexityCommand } from './complexity.js';
import { registerVisualizeCommand } from './visualize.js';

export function registerCommands(program: Command, cache: CacheContext): void {
  registerInitCommand(program, cache);
  registerAnalyzeCommand(program, cache);
  registerConfigCommand(program, cache);
  registerCacheCommand(program, cache);
  registerBaselineCommand(program, cache);
  registerRulesCommand(program);
  registerCircularCommand(program, cache);
  registerGraphCommand(program, cache);
  registerComplexityCommand(program, cache);
  registerVisualizeCommand(program);
}
