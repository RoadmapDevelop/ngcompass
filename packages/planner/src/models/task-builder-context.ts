import type { CacheKeyContext } from '@ngcompass/cache';
import type { ComponentDependencyGraph } from '../component-graph.js';
import type { TaskInputs } from './task.js';

export interface GraphStats {
  hits: number;
  misses: number;
  fallbacks: number;
}

export interface TaskBuilderContext {
  hashCache?: Map<string, string>;
  resourceCache?: Map<string, TaskInputs>;
  directoryCache?: Map<string, string[]>;
  globalHash?: string;
  componentGraph?: ComponentDependencyGraph;
  graphStats?: GraphStats;

  cacheKeyCtx?: CacheKeyContext;
}
