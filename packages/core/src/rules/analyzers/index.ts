/**
 * Cached Analyzers
 *
 * Centralized, cached, tri-state metadata extraction.
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
