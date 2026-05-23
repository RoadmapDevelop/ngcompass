/**
 * @fileoverview
 * Engine adapter — bridges the `RuleRegistry` (plugin boundary) with the
 * single-pass engine.
 *
 * Built-in rules and plugin rules both register through
 * {@link registerNewEngineRule}; the engine's `configureRuleExecutor` then
 * routes batched executions through {@link executeBatchedNewEngineRules},
 * which fans rule names out to the global registry and hands the resolved
 * handlers to `runSinglePassAnalysis`.
 *
 * No mutable global state lives here — all rule storage is owned by
 * `RuleRegistry`.
 */

import { debug, type RuleContext, type RuleResult } from '@ngcompass/common';
import { runSinglePassAnalysis, type RuleHandler } from '@ngcompass/engine';
import { getGlobalRegistry, type RulePlugin } from '../registry/rule-registry.js';

// ── Registration ──────────────────────────────────────────────────────────

/**
 * Registers a rule handler with the global registry.
 *
 * Delegates to `RuleRegistry.register()` so handlers and metadata live in
 * exactly one place — no dual-registration needed.
 */
export const registerNewEngineRule = (
    handler: RuleHandler<unknown>,
    category?: string,
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

// ── Query ─────────────────────────────────────────────────────────────────

/** Returns `true` when `ruleName` is registered in the global registry. */
export const isNewEngineRule = (ruleName: string): boolean =>
    getGlobalRegistry().has(ruleName);

// ── Batched execution ─────────────────────────────────────────────────────

/**
 * Executes every rule in `ruleNames` against `context` in a single AST pass.
 *
 * Handlers are resolved from the global registry (which contains both
 * built-in rules and plugin rules); the engine walks the AST exactly once
 * regardless of how many rules are batched together.
 *
 * @param ruleNames - Rules to execute on this file.
 * @param context   - Engine-provided rule context.
 * @returns Per-rule `RuleResult` objects in registration order.
 */
export const executeBatchedNewEngineRules = (
    ruleNames: ReadonlyArray<string>,
    context: RuleContext,
): ReadonlyArray<RuleResult> => {
    const registry = getGlobalRegistry();

    const handlers: RuleHandler<unknown>[] = [];
    for (const name of ruleNames) {
        const handler = registry.get(name);
        if (handler) handlers.push(handler);
    }
    if (handlers.length === 0) return [];

    debug('engine', `Executing ${handlers.length} rules in single pass on ${context.filePath}`);

    const { results, performance } = runSinglePassAnalysis(handlers, context);

    debug('engine', `Single-pass complete: ${performance.traversalMs.toFixed(2)}ms, ${performance.nodesVisited} nodes`);

    const cacheTotal = performance.cacheStats.hits + performance.cacheStats.misses;
    if (cacheTotal > 0) {
        const hitRate = (performance.cacheStats.hits / cacheTotal) * 100;
        debug('engine', `Component metadata cache hit rate: ${hitRate.toFixed(1)}%`);
    }

    if (performance.budgetViolations.length > 0) {
        debug('engine', `Performance budget violations: ${performance.budgetViolations.join('; ')}`);
    }

    return results;
};
