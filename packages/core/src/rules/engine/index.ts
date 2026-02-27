/**
 * High-Performance Rule Engine
 *
 * Single-pass Angular-aware static analysis engine.
 */

export { runSinglePassAnalysis, type PerformanceReport } from './single-pass-engine.js';
export {
    createComponentRule,
    createDecoratedPropertyRule,
    createTemplateExpressionRule,
    createTemplateAttributeRule,
    type RuleHandler,
    type StreamType,
} from './rule-handler.js';
export { type AngularClassNode, type DecoratedPropertyNode } from './node-streams.js';
export { buildVisitorMap, STREAM_TO_NODE_TYPE, type VisitorMap, type VisitorEntry } from './visitor-registry.js';
export { RuleContextFactory } from './rule-context-factory.js';
