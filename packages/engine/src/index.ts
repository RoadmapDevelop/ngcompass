/**
 * @fileoverview
 * Public entry point for the @ngcompass/engine package.
 *
 * Exposes core rule execution infrastructure, orchestrator components,
 * worker pool management, and analytical utilities.
 */

// Rule handler definition
export * from './rule-handler.js';

// Visitor registration and O(1) dispatch infrastructure.
export * from './visitor-registry.js';

// Single-pass AST engine
export * from './single-pass-engine.js';

// Rule context factory
export * from './rule-context-factory.js';

// Orchestrator
export * from './orchestrator.js';

// Memoized file system and AST accessors.
export { createAnalysisContext } from './analysis-context.js';
export type { AnalysisContext } from './analysis-context.js';

// Project context construction: import graph and component mapping utilities.
export { buildProjectContext } from './project-context-builder.js';

// Context extension for type-checker and project-aware analysis.
export { createTypeAwareAnalysisContext } from './type-aware-context.js';
export type { TypeAwareAnalysisContext } from './type-aware-context.js';

// Batched task execution engine.
export { executeBatchedTasks } from './runner.js';

// Rule executor abstraction: facilitates decoupling of engine and rules packages.
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

