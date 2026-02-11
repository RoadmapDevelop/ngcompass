/**
 * Component Analyzer (Cached, Tri-State, Zero-Copy)
 *
 * PERFORMANCE GUARANTEE:
 * - First call: O(D) where D = decorator properties
 * - Subsequent calls: O(1) WeakMap lookup
 * - Zero allocation after cache warm-up
 *
 * RULES MUST NEVER:
 * - Parse decorators themselves
 * - Retry inference on non-literal values
 * - Call this analyzer multiple times (it's cached!)
 */

import type { ClassDeclaration, Expression } from '../ast/types.js';
import {
    hasDecorator,
    getDecoratorNameUnsafe,
    getDecoratorObjectArgUnsafe,
    getObjectPropertyUnsafe,
    matchesMemberExpression,
    getLiteralStringValueUnsafe,
    getLiteralBooleanValueUnsafe,
} from '../ast/matchers.js';

// ============================================
// TRI-STATE METADATA (Literal | Non-Literal | Missing)
// ============================================

/**
 * Tri-state value (no Option<T> wrapper for performance).
 */
export type LiteralValue<T> = { readonly kind: 'literal'; readonly value: T };
export type NonLiteralValue = { readonly kind: 'non-literal' };
export type MissingValue = { readonly kind: 'missing' };

export type MetadataValue<T> = LiteralValue<T> | NonLiteralValue | MissingValue;

// Pre-allocated singletons (zero allocation)
const NON_LITERAL: NonLiteralValue = { kind: 'non-literal' };
const MISSING: MissingValue = { kind: 'missing' };

/**
 * Creates literal value (only allocation when literal is found).
 */
const literal = <T>(value: T): LiteralValue<T> => ({ kind: 'literal', value });

// ============================================
// COMPONENT METADATA
// ============================================

export enum ChangeDetectionStrategy {
    Default = 0,
    OnPush = 1,
}

/**
 * Component metadata (tri-state for all fields).
 *
 * PERFORMANCE: Allocated once per component, cached in WeakMap.
 */
export interface ComponentMetadata {
    readonly className: string | undefined;
    readonly selector: MetadataValue<string>;
    readonly changeDetection: MetadataValue<ChangeDetectionStrategy>;
    readonly standalone: MetadataValue<boolean>;
    readonly templateUrl: MetadataValue<string>;
    readonly template: MetadataValue<string>;
    readonly decoratorStart: number;  // Position of @Component decorator for error reporting
}

// ============================================
// CACHE (Per-File Execution)
// ============================================

/**
 * Component metadata cache (WeakMap for automatic GC).
 *
 * CRITICAL: This is the ONLY place component analysis happens.
 * Rules MUST call this, never parse decorators themselves.
 */
const componentCache = new WeakMap<ClassDeclaration, ComponentMetadata | null>();

/**
 * Cache statistics (instrumentation).
 */
let cacheHits = 0;
let cacheMisses = 0;

export const getComponentCacheStats = () => ({ hits: cacheHits, misses: cacheMisses });
export const resetComponentCacheStats = () => { cacheHits = 0; cacheMisses = 0; };

// ============================================
// MAIN ANALYZER (Cached)
// ============================================

/**
 * Analyzes @Component decorator metadata.
 *
 * @returns ComponentMetadata if @Component found, null otherwise
 *
 * PERFORMANCE:
 * - First call: O(D) where D = decorator properties
 * - Subsequent calls: O(1) WeakMap lookup
 *
 * RULES MUST:
 * - Call this once per component
 * - Handle null (not a component)
 * - Handle tri-state values (literal/non-literal/missing)
 *
 * RULES MUST NOT:
 * - Retry inference on non-literal values
 * - Parse decorators themselves
 * - Allocate collections
 */
export const analyzeComponent = (classNode: ClassDeclaration): ComponentMetadata | null => {
    // Check cache (O(1))
    const cached = componentCache.get(classNode);
    if (cached !== undefined) {
        cacheHits++;
        return cached;
    }

    cacheMisses++;

    // Not a component? Cache negative result.
    if (!hasDecorator(classNode, 'Component')) {
        componentCache.set(classNode, null);
        return null;
    }

    // Find @Component decorator
    const decorators = classNode.decorators;
    if (!decorators) {
        componentCache.set(classNode, null);
        return null;
    }

    let componentDecorator = undefined;
    for (let i = 0; i < decorators.length; i++) {
        const name = getDecoratorNameUnsafe(decorators[i]);
        if (name === 'Component') {
            componentDecorator = decorators[i];
            break;
        }
    }

    if (!componentDecorator) {
        componentCache.set(classNode, null);
        return null;
    }

    // Extract metadata object
    const metadataObject = getDecoratorObjectArgUnsafe(componentDecorator);

    // Build metadata (allocated once, cached)
    const metadata: ComponentMetadata = {
        className: classNode.id?.name,
        selector: metadataObject ? extractSelector(metadataObject) : MISSING,
        changeDetection: metadataObject ? extractChangeDetection(metadataObject) : MISSING,
        standalone: metadataObject ? extractStandalone(metadataObject) : MISSING,
        templateUrl: metadataObject ? extractTemplateUrl(metadataObject) : MISSING,
        template: metadataObject ? extractTemplate(metadataObject) : MISSING,
        decoratorStart: componentDecorator.start ?? componentDecorator.span?.start ?? 0,  // Track decorator position
    };

    componentCache.set(classNode, metadata);
    return metadata;
};

// ============================================
// PRIVATE EXTRACTORS (Tri-State, Zero-Copy)
// ============================================

const extractSelector = (metadataObject: any): MetadataValue<string> => {
    const selectorNode = getObjectPropertyUnsafe(metadataObject, 'selector');
    if (!selectorNode) return MISSING;

    const value = getLiteralStringValueUnsafe(selectorNode);
    if (value !== undefined) return literal(value);

    return NON_LITERAL;
};

const extractChangeDetection = (metadataObject: any): MetadataValue<ChangeDetectionStrategy> => {
    const cdNode = getObjectPropertyUnsafe(metadataObject, 'changeDetection');
    if (!cdNode) return MISSING;

    // Identifier: OnPush or Default
    if (cdNode.type === 'Identifier') {
        const name = (cdNode as any).name;
        if (name === 'OnPush') return literal(ChangeDetectionStrategy.OnPush);
        if (name === 'Default') return literal(ChangeDetectionStrategy.Default);
        return NON_LITERAL;
    }

    // Member: ChangeDetectionStrategy.OnPush
    if (matchesMemberExpression(cdNode, 'ChangeDetectionStrategy', 'OnPush')) {
        return literal(ChangeDetectionStrategy.OnPush);
    }

    if (matchesMemberExpression(cdNode, 'ChangeDetectionStrategy', 'Default')) {
        return literal(ChangeDetectionStrategy.Default);
    }

    return NON_LITERAL;
};

const extractStandalone = (metadataObject: any): MetadataValue<boolean> => {
    const standaloneNode = getObjectPropertyUnsafe(metadataObject, 'standalone');
    if (!standaloneNode) return MISSING;

    const value = getLiteralBooleanValueUnsafe(standaloneNode);
    if (value !== undefined) return literal(value);

    return NON_LITERAL;
};

const extractTemplateUrl = (metadataObject: any): MetadataValue<string> => {
    const templateUrlNode = getObjectPropertyUnsafe(metadataObject, 'templateUrl');
    if (!templateUrlNode) return MISSING;

    const value = getLiteralStringValueUnsafe(templateUrlNode);
    if (value !== undefined) return literal(value);

    return NON_LITERAL;
};

const extractTemplate = (metadataObject: any): MetadataValue<string> => {
    const templateNode = getObjectPropertyUnsafe(metadataObject, 'template');
    if (!templateNode) return MISSING;

    const value = getLiteralStringValueUnsafe(templateNode);
    if (value !== undefined) return literal(value);

    return NON_LITERAL;
};

// ============================================
// HIGH-LEVEL CHECKS (Convenience Functions)
// ============================================

/**
 * Checks if class is an Angular component.
 *
 * PERFORMANCE: O(1) after first call (cached).
 */
export const isComponent = (classNode: ClassDeclaration): boolean => {
    return analyzeComponent(classNode) !== null;
};

/**
 * Checks if component uses OnPush (literal value only).
 *
 * PERFORMANCE: O(1) after first call.
 */
export const usesOnPush = (classNode: ClassDeclaration): boolean => {
    const component = analyzeComponent(classNode);
    if (!component) return false;

    const cd = component.changeDetection;
    return cd.kind === 'literal' && cd.value === ChangeDetectionStrategy.OnPush;
};

/**
 * Checks if component is standalone: true (literal value only).
 */
export const isStandalone = (classNode: ClassDeclaration): boolean => {
    const component = analyzeComponent(classNode);
    if (!component) return false;

    const standalone = component.standalone;
    return standalone.kind === 'literal' && standalone.value === true;
};
