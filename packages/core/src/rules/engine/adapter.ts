/**
 * High-Performance Engine Adapter
 *
 * Bridges the new single-pass engine with the existing orchestrator.
 * Maintains backward compatibility while enabling batched rule execution.
 */

import type { RuleContext, RuleResult } from '../types.js';
import { runSinglePassAnalysis } from './single-pass-engine.js';
import type { RuleHandler } from './rule-handler.js';
import { debug } from '@ngcompass/common';

// Registry of new-style rule handlers
const newEngineRules = new Map<string, RuleHandler<any>>();

import { registerRuleImplementation } from '../registry.js';

/**
 * Registers a new-style rule handler with the adapter.
 *
 * @param handler - Rule handler implementing the new architecture
 */
export const registerNewEngineRule = (handler: RuleHandler<any>): void => {
    newEngineRules.set(handler.name, handler);

    // Also register in the global registry so it's "known"
    registerRuleImplementation(
        handler.name,
        (context: RuleContext) => executeNewEngineRule(handler.name, context),
        {
            // Extract metadata if available from handler
            category: 'best-practice', // Default, should ideally come from handler
            dependencyType: 'component', // Default
            ...handler.meta,
        }
    );

    debug('engine', `Registered new engine rule: ${handler.name}`);
};

/**
 * Checks if a rule is implemented in the new engine.
 *
 * @param ruleName - Rule name to check
 * @returns true if rule uses new engine
 */
export const isNewEngineRule = (ruleName: string): boolean => {
    return newEngineRules.has(ruleName);
};

/**
 * Gets all new engine rule names.
 *
 * @returns Array of rule names
 */
export const getNewEngineRuleNames = (): ReadonlyArray<string> => {
    return Array.from(newEngineRules.keys());
};

/**
 * Executes a single rule using the new engine (for backward compatibility).
 *
 * This adapter allows new-style rules to work with the existing
 * one-rule-per-task execution model.
 * 
 * @deprecated Use `executeBatchedNewEngineRules` for better performance.
 *
 * @param ruleName - Rule to execute
 * @param context - Rule context
 * @returns Rule result
 */
export const executeNewEngineRule = (ruleName: string, context: RuleContext): RuleResult => {
    const handler = newEngineRules.get(ruleName);

    if (!handler) {
        return {
            ruleName,
            failures: [],
        };
    }

    // Run single rule through the engine
    const { results, performance } = runSinglePassAnalysis([handler], context);

    // Log performance metrics if available
    if (performance.budgetViolations.length > 0) {
        debug('engine', `Performance budget violations for ${ruleName}:`, performance.budgetViolations);
    }

    // Return first result (should only be one)
    return results[0] || { ruleName, failures: [] };
};

/**
 * Executes multiple rules in a single pass (optimal path).
 *
 * This is the preferred execution model as it maximizes the benefits
 * of the single-pass architecture.
 *
 * @param ruleNames - Rules to execute
 * @param context - Rule context
 * @returns Array of rule results
 */
export const executeBatchedNewEngineRules = (
    ruleNames: ReadonlyArray<string>,
    context: RuleContext
): ReadonlyArray<RuleResult> => {
    // Filter to only new engine rules
    const handlers = ruleNames
        .map(name => newEngineRules.get(name))
        .filter((h): h is RuleHandler<any> => h !== undefined);

    if (handlers.length === 0) {
        return [];
    }

    debug('engine', `Executing ${handlers.length} rules in single pass on ${context.filePath}`);

    // Run all rules in a single pass
    const { results, performance } = runSinglePassAnalysis(handlers, context);

    // Log performance metrics
    debug('engine', `Single-pass analysis completed in ${performance.traversalMs.toFixed(2)}ms`);
    debug('engine', `Nodes visited: ${performance.nodesVisited}`);
    debug('engine', `Cache hit rate: ${((performance.cacheStats.hits / (performance.cacheStats.hits + performance.cacheStats.misses || 1)) * 100).toFixed(1)
        }%`);

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

// Internal stats tracking
let totalExecutions = 0;
let totalBatchedExecutions = 0;
let totalTraversalMs = 0;
let totalCacheHits = 0;
let totalCacheMisses = 0;

/**
 * Gets engine performance statistics.
 *
 * @returns Current statistics
 */
export const getEngineStats = (): EngineStats => {
    const totalCache = totalCacheHits + totalCacheMisses || 1;

    return {
        totalExecutions,
        totalBatchedExecutions,
        avgTraversalMs: totalExecutions > 0 ? totalTraversalMs / totalExecutions : 0,
        avgCacheHitRate: (totalCacheHits / totalCache) * 100,
    };
};

/**
 * Resets engine statistics (for testing).
 */
export const resetEngineStats = (): void => {
    totalExecutions = 0;
    totalBatchedExecutions = 0;
    totalTraversalMs = 0;
    totalCacheHits = 0;
    totalCacheMisses = 0;
};
