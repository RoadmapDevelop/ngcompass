/**
 * @fileoverview
 * Establishes a dependency injection boundary for rule execution.
 *
 * This module facilitates the decoupling of the engine's core orchestration layer
 * from the concrete rule implementations, mitigating circular dependency risks.
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
 * Configures the analytical engine with specific rule execution and validation logic.
 *
 * This method must be invoked during the initialization phase of the process
 * to register the underlying rule processing capabilities.
 *
 * @param executor The implementation responsible for batched rule evaluation.
 * @param checker The implementation responsible for rule presence verification.
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
