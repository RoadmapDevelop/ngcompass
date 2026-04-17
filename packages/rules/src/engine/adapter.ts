/**
 * High-Performance Engine Adapter
 *
 * Bridges the RuleRegistry (plugin boundary) with the single-pass engine
 * and the legacy orchestrator API. Maintains backward compatibility while
 * enabling batched rule execution and external plugin registration.
 *
 * The mutable bare Map that previously lived here has been replaced by
 * the global RuleRegistry singleton — see rules/registry/rule-registry.ts.
 */

import type { RuleContext, RuleResult } from '@ngcompass/common';
import { runSinglePassAnalysis } from '@ngcompass/engine';
import type { RuleHandler } from '@ngcompass/engine';
import { debug } from '@ngcompass/common';
import { getGlobalRegistry } from '../registry/rule-registry.js';
import type { RulePlugin } from '../registry/rule-registry.js';

// ============================================
// REGISTRATION API
// ============================================

/**
 * Registers a new-style rule handler.
 *
 * Delegates to RuleRegistry.register() — the single source of truth
 * for both rule handlers and metadata. No dual-registration needed.
 */
export const registerNewEngineRule = (handler: RuleHandler<unknown>, category?: string): void => {
    const plugin: RulePlugin = {
        name: handler.name,
        handler,
        meta: {
            dependencyType: 'component',
            ...handler.meta,
            category: category ?? handler.meta?.category ?? 'best-practice',
            requires: {
                ...handler.meta?.requires
            }
        },
    };

    getGlobalRegistry().register(plugin);

    debug('engine', `Registered rule: ${handler.name}`);
};

// ============================================
// QUERY API
// ============================================

/**
 * Checks if a rule is implemented in the engine.
 */
export const isNewEngineRule = (ruleName: string): boolean => {
    return getGlobalRegistry().has(ruleName);
};

/**
 * Gets all registered rule names.
 */
export const getNewEngineRuleNames = (): ReadonlyArray<string> => {
    return getGlobalRegistry().getRuleNames();
};

// ============================================
// BATCHED EXECUTION API
// ============================================

/**
 * Executes multiple rules in a single AST pass (optimal path).
 *
 * All handlers for the given rule names are collected from the global
 * RuleRegistry (which includes both built-in rules and plugin rules) and
 * passed to runSinglePassAnalysis() — the AST is walked exactly once.
 *
 * @param ruleNames - Rules to execute
 * @param context   - Rule execution context
 * @returns Array of RuleResults, one per rule name
 */
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

    if (handlers.length === 0) {
        return [];
    }

    debug('engine', `Executing ${handlers.length} rules in single pass on ${context.filePath}`);

    const { results, performance } = runSinglePassAnalysis(handlers, context);

    debug('engine', `Single-pass complete: ${performance.traversalMs.toFixed(2)}ms, ${performance.nodesVisited} nodes`);
    debug('engine', `Cache hit rate: ${(
        (performance.cacheStats.hits / (performance.cacheStats.hits + performance.cacheStats.misses || 1)) * 100
    ).toFixed(1)}%`);

    if (performance.budgetViolations.length > 0) {
        debug('engine', 'Performance budget violations:', performance.budgetViolations);
    }

    return results;
};

/**
 * Performance statistics for monitoring.
 */
export interface EngineStats {
    readonly totalExecutions: number;
    readonly totalBatchedExecutions: number;
    readonly avgTraversalMs: number;
    readonly avgCacheHitRate: number;
}

/**
 * Scoped stats accumulator – avoids loose mutable module-level variables.
 */
interface EngineStatsAccumulator {
    totalExecutions: number;
    totalBatchedExecutions: number;
    totalTraversalMs: number;
    totalCacheHits: number;
    totalCacheMisses: number;
}

const stats: EngineStatsAccumulator = {
    totalExecutions: 0,
    totalBatchedExecutions: 0,
    totalTraversalMs: 0,
    totalCacheHits: 0,
    totalCacheMisses: 0,
};

/**
 * Gets engine performance statistics.
 *
 * @returns Current statistics snapshot
 */
export const getEngineStats = (): EngineStats => {
    const totalCache = stats.totalCacheHits + stats.totalCacheMisses || 1;

    return {
        totalExecutions: stats.totalExecutions,
        totalBatchedExecutions: stats.totalBatchedExecutions,
        avgTraversalMs: stats.totalExecutions > 0 ? stats.totalTraversalMs / stats.totalExecutions : 0,
        avgCacheHitRate: (stats.totalCacheHits / totalCache) * 100,
    };
};

/**
 * Resets engine statistics (for testing).
 */
export const resetEngineStats = (): void => {
    stats.totalExecutions = 0;
    stats.totalBatchedExecutions = 0;
    stats.totalTraversalMs = 0;
    stats.totalCacheHits = 0;
    stats.totalCacheMisses = 0;
};
