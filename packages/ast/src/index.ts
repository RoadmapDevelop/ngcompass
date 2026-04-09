/**
 * @ngcompass/ast
 *
 * AST types, parsers, analyzers, node streams and visitor for the ngcompass analysis engine.
 */

// AST types and matchers
export * from './ast/index.js';

// Analyzers (component + template)
export * from './analyzers/index.js';

// Node streams and stream filter functions
export * from './node-streams.js';

// Parsers (html, css, ts, template-extractor) — merged into @ngcompass/ast
export * from './parsers/index.js';

// AST visitor
export { walkProgram } from './visitor.js';
