import { debug, type RuleContext, type RuleResult } from '@ngcompass/common';
import { runSinglePassAnalysis, type RuleHandler } from '@ngcompass/engine';
import {
  getGlobalRegistry,
  type RulePlugin,
} from '../registry/rule-registry.js';

export const registerNewEngineRule = (
  handler: RuleHandler<unknown>,
  category?: string
): void => {
  const plugin: RulePlugin = {
    name: handler.name,
    handler,
    meta: {
      dependencyType: 'component',
      ...handler.meta,
      category: category ?? handler.meta?.category ?? 'best-practice',
      requires: handler.meta?.requires ?? {},
    },
  };

  getGlobalRegistry().register(plugin);
  debug('engine', `Registered rule: ${handler.name}`);
};

export const isNewEngineRule = (ruleName: string): boolean =>
  getGlobalRegistry().has(ruleName);

export const executeBatchedNewEngineRules = (
  ruleNames: ReadonlyArray<string>,
  context: RuleContext
): ReadonlyArray<RuleResult> => {
  const registry = getGlobalRegistry();

  const handlers: RuleHandler<unknown>[] = [];
  for (const name of ruleNames) {
    const handler = registry.get(name);
    if (handler) handlers.push(handler);
  }
  if (handlers.length === 0) return [];

  debug(
    'engine',
    `Executing ${handlers.length} rules in single pass on ${context.filePath}`
  );

  const { results, performance } = runSinglePassAnalysis(handlers, context);

  debug(
    'engine',
    `Single-pass complete: ${performance.traversalMs.toFixed(2)}ms, ${performance.nodesVisited} nodes`
  );

  const cacheTotal =
    performance.cacheStats.hits + performance.cacheStats.misses;
  if (cacheTotal > 0) {
    const hitRate = (performance.cacheStats.hits / cacheTotal) * 100;
    debug(
      'engine',
      `Component metadata cache hit rate: ${hitRate.toFixed(1)}%`
    );
  }

  if (performance.budgetViolations.length > 0) {
    debug(
      'engine',
      `Performance budget violations: ${performance.budgetViolations.join('; ')}`
    );
  }

  return results;
};
