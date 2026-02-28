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

// Analysis stats
export * from './analysis-stats.js';

// Constants
export * from './constants.js';

// Spinner utility
export * from './spinner.js';

// Worker pool
export * from './worker-pool.js';

