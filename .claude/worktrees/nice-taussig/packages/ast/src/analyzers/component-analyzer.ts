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

import type { ClassDeclaration } from '../ast/types.js';
import {
    hasDecorator,
    getDecoratorNameUnsafe,
    getDecoratorObjectArgUnsafe,
    getObjectPropertyUnsafe,
    matchesMemberExpression,
    getLiteralStringValueUnsafe,
    getLiteralBooleanValueUnsafe,
} from '../ast/matchers.js';
import type { ArrayExpression, ObjectExpression, Expression, Identifier } from '../ast/types.js';

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
 * Host directive metadata.
 */
export interface HostDirectiveMetadata {
    readonly directive: string | undefined;
    readonly inputs: ReadonlyArray<{ readonly internal: string; readonly external: string }>;
    readonly outputs: ReadonlyArray<{ readonly internal: string; readonly external: string }>;
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
    readonly hostDirectives: MetadataValue<ReadonlyArray<HostDirectiveMetadata>>;
    readonly decoratorStart: number;  // Position of decorator for error reporting
    readonly type: 'Component' | 'Directive';
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
 * Cache statistics (scoped accumulator – avoids loose mutable globals).
 */
interface CacheStatsAccumulator {
    hits: number;
    misses: number;
}

const cacheStats: CacheStatsAccumulator = { hits: 0, misses: 0 };

export const getComponentCacheStats = (): Readonly<CacheStatsAccumulator> => ({ hits: cacheStats.hits, misses: cacheStats.misses });
export const resetComponentCacheStats = (): void => { cacheStats.hits = 0; cacheStats.misses = 0; };

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
        cacheStats.hits++;
        return cached;
    }

    cacheStats.misses++;

    // Not a component or directive? Cache negative result.
    const isComp = hasDecorator(classNode, 'Component');
    const isDir = !isComp && hasDecorator(classNode, 'Directive');

    if (!isComp && !isDir) {
        componentCache.set(classNode, null);
        return null;
    }

    const decoratorName = isComp ? 'Component' : 'Directive';

    // Find @Component decorator
    const decorators = classNode.decorators;
    if (!decorators) {
        componentCache.set(classNode, null);
        return null;
    }

    let angularDecorator = undefined;
    for (let i = 0; i < decorators.length; i++) {
        const name = getDecoratorNameUnsafe(decorators[i]);
        if (name === decoratorName) {
            angularDecorator = decorators[i];
            break;
        }
    }

    if (!angularDecorator) {
        componentCache.set(classNode, null);
        return null;
    }

    // Extract metadata object
    const metadataObject = getDecoratorObjectArgUnsafe(angularDecorator);

    // Build metadata (allocated once, cached)
    const metadata: ComponentMetadata = {
        className: classNode.id?.name,
        selector: metadataObject ? extractSelector(metadataObject) : MISSING,
        changeDetection: isComp && metadataObject ? extractChangeDetection(metadataObject) : MISSING,
        standalone: metadataObject ? extractStandalone(metadataObject) : MISSING,
        templateUrl: isComp && metadataObject ? extractTemplateUrl(metadataObject) : MISSING,
        template: isComp && metadataObject ? extractTemplate(metadataObject) : MISSING,
        hostDirectives: metadataObject ? extractHostDirectives(metadataObject) : MISSING,
        decoratorStart: angularDecorator.start ?? angularDecorator.span?.start ?? 0,  // Track decorator position
        type: decoratorName,
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

const extractHostDirectives = (metadataObject: any): MetadataValue<ReadonlyArray<HostDirectiveMetadata>> => {
    const hostNode = getObjectPropertyUnsafe(metadataObject, 'hostDirectives');
    if (!hostNode) return MISSING;

    if (hostNode.type !== 'ArrayExpression') return NON_LITERAL;

    const hostArr = hostNode as ArrayExpression;
    const results: HostDirectiveMetadata[] = [];
    const elements = hostArr.elements;

    for (let i = 0; i < elements.length; i++) {
        const el = elements[i];
        if (!el) continue;

        // Case 1: Class reference [MyDir]
        if (el.type === 'Identifier') {
            results.push({ directive: (el as Identifier).name, inputs: [], outputs: [] });
            continue;
        }

        // Case 2: Object { directive: MyDir, inputs: [...], outputs: [...] }
        if (el.type === 'ObjectExpression') {
            const objEl = el as ObjectExpression;
            const dirNode = getObjectPropertyUnsafe(objEl, 'directive');
            const directive = dirNode?.type === 'Identifier' ? (dirNode as Identifier).name : undefined;

            const inputs = extractRenames(getObjectPropertyUnsafe(objEl, 'inputs'));
            const outputs = extractRenames(getObjectPropertyUnsafe(objEl, 'outputs'));

            results.push({ directive, inputs, outputs });
            continue;
        }

        // Unknown type
    }

    return literal(results);
};

const extractRenames = (node: Expression | undefined): ReadonlyArray<{ internal: string, external: string }> => {
    if (!node || node.type !== 'ArrayExpression') return [];

    const arrNode = node as ArrayExpression;
    const renames: { internal: string, external: string }[] = [];
    const elements = arrNode.elements;

    for (let i = 0; i < elements.length; i++) {
        const el = elements[i];
        if (!el) continue;

        const value = getLiteralStringValueUnsafe(el);
        if (!value) continue;

        if (value.includes(':')) {
            const [internal, external] = value.split(':').map(s => s.trim());
            renames.push({ internal, external });
        } else {
            renames.push({ internal: value, external: value });
        }
    }

    return renames;
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
