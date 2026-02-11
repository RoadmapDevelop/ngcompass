/**
 * High-Performance Rule Engine
 *
 * Single-pass Angular-aware static analysis engine.
 */

export { runSinglePassAnalysis, type PerformanceReport } from './single-pass-engine.js';
export { createComponentRule, createDecoratedPropertyRule, type RuleHandler, type StreamType } from './rule-handler.js';
export { type AngularComponentNode, type DecoratedPropertyNode } from './node-streams.js';
