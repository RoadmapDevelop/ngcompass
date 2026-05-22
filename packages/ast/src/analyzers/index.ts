/**
 * @fileoverview
 * Barrel for the cached analyzers.
 *
 * Surfaces the `@Component` / `@Directive` metadata extractor with its
 * tri-state value types and the template analyzer that turns an
 * `angular-html-parser` AST into the stream nodes the engine dispatches.
 */

export {
    analyzeComponent,
    isComponent,
    usesOnPush,
    isStandalone,
    getComponentCacheStats,
    resetComponentCacheStats,
    ChangeDetectionStrategy,
    type ComponentMetadata,
    type MetadataValue,
    type LiteralValue,
    type NonLiteralValue,
    type MissingValue,
} from './component-analyzer.js';
export { analyzeTemplate } from './template-analyzer.js';
