/**
 * Rule Executor — Dependency Injection Boundary
 *
 * Decouples the engine's runner from the concrete rule registry in
 * @ngcompass/rules, breaking the engine ↔ rules circular dependency.
 *
 * Usage:
 *  - Call configureRuleExecutor() once at process start (CLI main thread)
 *    or at worker start (execution-worker.ts in @ngcompass/rules) before
 *    any call to executeBatchedTasks().
 *  - The engine's runner.ts reads the injected callbacks at execution time.
 */

import type { RuleContext, RuleResult } from '@ngcompass/common';

// ============================================================
// TYPES
// ============================================================

/**
 * Executes multiple rules in a single AST pass and returns their results.
 * Implemented by rules/src/engine/adapter.ts → executeBatchedNewEngineRules.
 */
export type BatchRuleExecutorFn = (
    ruleNames: ReadonlyArray<string>,
    context: RuleContext,
) => ReadonlyArray<RuleResult>;

/**
 * Returns true if a rule with the given name is registered in the engine.
 * Implemented by rules/src/engine/adapter.ts → isNewEngineRule.
 */
export type RuleCheckerFn = (ruleName: string) => boolean;

// ============================================================
// SINGLETON STATE
// ============================================================

const _unConfiguredMsg =
    '[ngcompass] Rule executor not configured. ' +
    'Call configureRuleExecutor(executeBatchedNewEngineRules, isNewEngineRule) ' +
    'before running analysis.';

let _executor: BatchRuleExecutorFn = () => {
    throw new Error(_unConfiguredMsg);
};
let _checker: RuleCheckerFn = () => false;

// ============================================================
// PUBLIC API
// ============================================================

/**
 * Registers the concrete rule executor and rule checker.
 *
 * Must be called once before analysis runs:
 *  - In the main thread: call from the CLI entry point after loading rules.
 *  - In worker threads: call from execution-worker.ts after registerAllBuiltinRules().
 *
 * @param executor - Runs a batch of rules in a single AST pass
 * @param checker  - Returns true if a rule name is registered
 */
export const configureRuleExecutor = (
    executor: BatchRuleExecutorFn,
    checker: RuleCheckerFn,
): void => {
    _executor = executor;
    _checker = checker;
};

/**
 * Returns the currently configured batch rule executor.
 * For internal use by runner.ts only.
 */
export const getConfiguredExecutor = (): BatchRuleExecutorFn => _executor;

/**
 * Returns the currently configured rule checker.
 * For internal use by runner.ts only.
 */
export const getConfiguredChecker = (): RuleCheckerFn => _checker;
