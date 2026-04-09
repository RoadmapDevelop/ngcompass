/**
 * Node Streams (Pre-Filtered Semantic Dispatch)
 *
 * PERFORMANCE RULE:
 * Rules must subscribe to the most specific stream possible.
 *
 * FORBIDDEN:
 * - Rules checking "is this a component?" (use AngularClassStream)
 * - Rules checking "is this decorated?" (use DecoratedPropertyStream)
 * - Rules checking node types (dispatcher handles this)
 */

import type { ClassDeclaration, PropertyDefinition, Decorator, Expression, CallExpression, NewExpression } from './ast/types.js';
import { analyzeComponent, type ComponentMetadata } from './analyzers/component-analyzer.js';
import { getDecoratorNameUnsafe } from './ast/matchers.js';

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

export interface TemplateBlockNode {
    readonly name: string;
    readonly parameters: ReadonlyArray<{
        readonly expression: string;
        readonly sourceSpan: { start: number, end: number };
    }>;
    readonly sourceSpan: { start: number, end: number };
}

export interface TemplateAnalysis {
    readonly expressions: ReadonlyArray<TemplateExpressionNode>;
    readonly attributes: ReadonlyArray<TemplateAttributeNode>;
    readonly blocks: ReadonlyArray<TemplateBlockNode>;
}

/**
 * Angular Decorator Stream: ClassDeclaration nodes with @Component or @Directive.
 *
 * Rules subscribing to this stream are guaranteed:
 * - Node is a ClassDeclaration
 * - Node has @Component or @Directive decorator
 * - Metadata is pre-analyzed and cached
 */
export interface AngularClassNode {
    readonly node: ClassDeclaration;
    readonly metadata: ComponentMetadata;  // Covers both Components and Directives
}

/**
 * Any Angular Decorated Class Stream: ClassDeclaration nodes with ANY Angular decorator.
 *
 * Rules subscribing to this stream are guaranteed:
 * - Node is a ClassDeclaration
 * - Node has at least one of: @Component, @Directive, @Pipe, @Injectable, @NgModule
 *
 * Use this when the rule applies beyond @Component/@Directive (e.g. naming rules
 * for pipes, services, or guards).
 */
export interface AnyAngularClassNode {
    readonly node: ClassDeclaration;
    readonly decoratorName: string;   // e.g. 'Pipe', 'Injectable', 'Component', …
    readonly className: string | undefined;
    readonly decoratorStart: number;
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
 * Filters ClassDeclaration nodes to Angular components or directives.
 *
 * PERFORMANCE: O(1) after first call (cached).
 * Called by engine during traversal, not by rules.
 */
export const toAngularClassStream = (
    classNode: ClassDeclaration
): AngularClassNode | null => {
    const metadata = analyzeComponent(classNode);
    if (!metadata) return null;

    return {
        node: classNode,
        metadata,  // Already analyzed, zero-copy reference
    };
};

/** Angular decorators that qualify a class for the AnyAngularClass stream. */
const ANY_ANGULAR_DECORATORS = new Set(['Component', 'Directive', 'Pipe', 'Injectable', 'NgModule']);

/**
 * Filters ClassDeclaration nodes to ANY Angular-decorated class.
 *
 * PERFORMANCE: O(D) where D = number of decorators on the class (usually 1).
 * Called by engine during traversal, not by rules.
 */
export const toAnyAngularClassStream = (
    classNode: ClassDeclaration
): AnyAngularClassNode | null => {
    const decorators = classNode.decorators;
    if (!decorators) return null;

    for (let i = 0; i < decorators.length; i++) {
        const name = getDecoratorNameUnsafe(decorators[i]);
        if (name && ANY_ANGULAR_DECORATORS.has(name)) {
            return {
                node: classNode,
                decoratorName: name,
                className: classNode.id?.name,
                decoratorStart: decorators[i].start ?? decorators[i].span?.start ?? 0,
            };
        }
    }

    return null;
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

/**
 * Pass-through filter for CallExpression stream.
 */
export const toCallExpressionStream = (node: CallExpression): CallExpression => node;

/**
 * Pass-through filter for NewExpression stream.
 */
export const toNewExpressionStream = (node: NewExpression): NewExpression => node;
