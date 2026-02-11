/**
 * Node Streams (Pre-Filtered Semantic Dispatch)
 *
 * PERFORMANCE RULE:
 * Rules must subscribe to the most specific stream possible.
 *
 * FORBIDDEN:
 * - Rules checking "is this a component?" (use AngularComponentStream)
 * - Rules checking "is this decorated?" (use DecoratedPropertyStream)
 * - Rules checking node types (dispatcher handles this)
 */

import type { ClassDeclaration, PropertyDefinition, Decorator, Expression } from '../ast/types.js';
import { analyzeComponent, type ComponentMetadata } from '../analyzers/component-analyzer.js';

// ============================================
// STREAM DEFINITIONS
// ============================================

export interface TemplateExpressionNode {
    readonly expression: Expression;
    readonly sourceSpan: { start: number, end: number };
}

export interface TemplateAttributeNode {
    readonly name: string;
    readonly value?: string;
    readonly sourceSpan: { start: number, end: number };
}

/**
 * Angular Component Stream: ClassDeclaration nodes with @Component.
 *
 * Rules subscribing to this stream are guaranteed:
 * - Node is a ClassDeclaration
 * - Node has @Component decorator
 * - ComponentMetadata is pre-analyzed and cached
 */
export interface AngularComponentNode {
    readonly node: ClassDeclaration;
    readonly metadata: ComponentMetadata;  // Pre-analyzed!
}

/**
 * Decorated Property Stream: PropertyDefinition nodes with decorators.
 *
 * Rules subscribing to this stream are guaranteed:
 * - Node is a PropertyDefinition
 * - Node has at least one decorator (@Input, @Output, @ViewChild, etc.)
 */
export interface DecoratedPropertyNode {
    readonly node: PropertyDefinition;
    readonly decorators: ReadonlyArray<Decorator>;  // Pre-extracted
}

// ============================================
// STREAM FILTERS (Called by Engine)
// ============================================

/**
 * Filters ClassDeclaration nodes to Angular components.
 *
 * PERFORMANCE: O(1) after first call (cached).
 * Called by engine during traversal, not by rules.
 */
export const toAngularComponentStream = (
    classNode: ClassDeclaration
): AngularComponentNode | null => {
    const metadata = analyzeComponent(classNode);
    if (!metadata) return null;

    return {
        node: classNode,
        metadata,  // Already analyzed, zero-copy reference
    };
};

/**
 * Filters PropertyDefinition nodes to decorated properties.
 *
 * PERFORMANCE: O(1) decorator array access.
 * Called by engine, not by rules.
 */
export const toDecoratedPropertyStream = (
    propertyNode: PropertyDefinition
): DecoratedPropertyNode | null => {
    const decorators = propertyNode.decorators;
    if (!decorators || decorators.length === 0) return null;

    return {
        node: propertyNode,
        decorators,  // Zero-copy reference
    };
};
