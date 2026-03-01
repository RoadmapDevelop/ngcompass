/**
 * @ngcompass/engine
 *
 * Rule execution engine — types, handlers, single-pass AST walker,
 * orchestrator, worker pool and rule context factory.
 */

// Core rule types (RuleFailure, RuleResult, RuleContext, RuleMetadata, …)
export * from './types.js';

// Rule handler definition
export * from './rule-handler.js';

// Visitor registry (O(1) dispatch map)
export * from './visitor-registry.js';

// Single-pass AST engine
export * from './single-pass-engine.js';

// Rule context factory
export * from './rule-context-factory.js';

// Orchestrator
export * from './orchestrator.js';

// Analysis context (memoized file/AST accessors — used by execution-worker in @ngcompass/rules)
export { createAnalysisContext } from './analysis-context.js';
export type { AnalysisContext } from './analysis-context.js';

// Runner (batched task execution — used by execution-worker in @ngcompass/rules)
// Note: ExecutionContext is NOT re-exported here to avoid conflict with rule-context-factory.ts
export { executeBatchedTasks } from './runner.js';

// Rule executor DI boundary — breaks the engine ↔ rules circular dependency
export { configureRuleExecutor } from './rule-executor.js';
export type { BatchRuleExecutorFn, RuleCheckerFn } from './rule-executor.js';

// Analysis stats
export * from './analysis-stats.js';

// Constants
export * from './constants.js';

// Spinner utility
export * from './spinner.js';

// Worker pool
export * from './worker-pool.js';

