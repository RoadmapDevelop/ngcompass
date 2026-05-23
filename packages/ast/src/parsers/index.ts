/**
 * @fileoverview
 * Barrel for the parsers sub-folder.
 *
 * Re-exports the TypeScript (`ts`), Angular HTML (`html`), CSS (`css`) and
 * inline-template extraction (`template-extractor`) entry points. The
 * engine consumes parsers through this barrel so future parser swaps stay
 * local to one folder.
 */

export * from './css.js';
export * from './html.js';
export * from './template-extractor.js';
export * from './ts.js';
