/**
 * @fileoverview
 * Public entry point for `@ngcompass/ast`.
 *
 * Surfaces the AST type system, zero-allocation matchers, cached analyzers,
 * node-stream filters, parsers (TS, HTML, CSS, inline template extraction),
 * and the shared `walkProgram` visitor. Consumers (engine, planner, rules)
 * should import from this barrel and never reach into the sub-folders.
 */

// AST types and matchers
export * from './ast/index.js';

// Analyzers (component + template)
export * from './analyzers/index.js';

// Node streams and stream filter functions
export * from './node-streams.js';

// Parsers (html, css, ts, template-extractor)
export * from './parsers/index.js';

// AST visitor
export { walkProgram } from './visitor.js';
