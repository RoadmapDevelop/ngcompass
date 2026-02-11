/**
 * AST Matchers (Zero-Allocation, Pure Functions)
 *
 * PERFORMANCE RULES:
 * - No object creation in hot paths
 * - No array allocations
 * - No string concatenation
 * - Return primitives or pre-existing references only
 *
 * "Unsafe" suffix convention: May return undefined, caller must handle.
 */

import type {
    Decorator,
    ClassDeclaration,
    ObjectExpression,
    Expression,
    CallExpression,
    MemberExpression,
} from './types.js';

// ============================================
// DECORATOR CHECKS (Zero Allocation)
// ============================================

/**
 * Checks if a node has a specific decorator.
 *
 * @returns boolean (primitive, zero allocation)
 */
export const hasDecorator = (
    classNode: ClassDeclaration,
    decoratorName: string
): boolean => {
    const decorators = classNode.decorators;
    if (!decorators) return false;

    for (let i = 0; i < decorators.length; i++) {
        const decorator = decorators[i];
        const name = getDecoratorNameUnsafe(decorator);
        if (name === decoratorName) return true;
    }

    return false;
};

/**
 * Gets decorator name (unsafe: may return undefined).
 *
 * PERFORMANCE: Returns string reference from AST (zero copy).
 * Rules must handle undefined.
 */
export const getDecoratorNameUnsafe = (decorator: Decorator): string | undefined => {
    const expr = decorator.expression;
    if (!expr) return undefined;

    if (expr.type === 'CallExpression') {
        const callee = expr.callee;

        // Simple: @Component
        if (callee.type === 'Identifier') {
            return (callee as any).name;
        }

        // Member: @core.Component
        if (callee.type === 'MemberExpression' || callee.type === 'StaticMemberExpression') {
            const prop = (callee as MemberExpression).property;
            if (prop.type === 'Identifier') {
                return prop.name;
            }
        }
    }

    return undefined;
};

/**
 * Gets first decorator argument if it's an object literal.
 *
 * PERFORMANCE: Returns AST reference (zero copy).
 */
export const getDecoratorObjectArgUnsafe = (
    decorator: Decorator
): ObjectExpression | undefined => {
    const expr = decorator.expression;
    if (!expr || expr.type !== 'CallExpression') return undefined;

    const args = expr.arguments;
    if (!args || args.length === 0) return undefined;

    const first = args[0];
    return first.type === 'ObjectExpression' ? (first as ObjectExpression) : undefined;
};

// ============================================
// OBJECT PROPERTY LOOKUP (Zero Allocation)
// ============================================

/**
 * Checks if object has a property with given key.
 *
 * PERFORMANCE: No allocation, early return.
 */
export const hasObjectProperty = (
    objectExpr: ObjectExpression,
    keyName: string
): boolean => {
    const properties = objectExpr.properties;
    if (!properties) return false;

    for (let i = 0; i < properties.length; i++) {
        const prop = properties[i];
        if (!prop || !('key' in prop)) continue;

        const key = (prop as any).key;
        const actualKeyName = getKeyNameUnsafe(key);

        if (actualKeyName === keyName) return true;
    }

    return false;
};

/**
 * Gets property value by key name (unsafe: may return undefined).
 *
 * PERFORMANCE: Returns AST reference (zero copy).
 */
export const getObjectPropertyUnsafe = (
    objectExpr: ObjectExpression,
    keyName: string
): Expression | undefined => {
    const properties = objectExpr.properties;
    if (!properties) return undefined;

    for (let i = 0; i < properties.length; i++) {
        const prop = properties[i];
        if (!prop || !('key' in prop) || !('value' in prop)) continue;

        const key = (prop as any).key;
        const actualKeyName = getKeyNameUnsafe(key);

        if (actualKeyName === keyName) {
            return (prop as any).value;
        }
    }

    return undefined;
};

/**
 * Gets key name from object key (unsafe).
 *
 * PERFORMANCE: Returns string reference from AST.
 */
export const getKeyNameUnsafe = (key: Expression): string | undefined => {
    if (!key) return undefined;

    // Identifier: { foo: ... }
    if (key.type === 'Identifier') return (key as any).name;

    // String literal: { "foo": ... }
    if (key.type === 'StringLiteral') return (key as any).value;

    // Generic Literal
    if (key.type === 'Literal' && typeof (key as any).value === 'string') {
        return (key as any).value;
    }

    return undefined;
};

// ============================================
// MEMBER EXPRESSION CHECKS
// ============================================

/**
 * Checks if member expression matches pattern (e.g., ChangeDetectionStrategy.OnPush).
 *
 * PERFORMANCE: No allocation, early return.
 */
export const matchesMemberExpression = (
    expr: Expression,
    objectName: string,
    propertyName: string
): boolean => {
    if (!expr) return false;

    if (expr.type !== 'MemberExpression' && expr.type !== 'StaticMemberExpression') {
        return false;
    }

    const memberExpr = expr as MemberExpression;

    // Check property
    const prop = memberExpr.property;
    if (!prop || prop.type !== 'Identifier' || prop.name !== propertyName) {
        return false;
    }

    // Check object
    const obj = memberExpr.object;
    if (!obj) return false;

    // Simple: ChangeDetectionStrategy.OnPush
    if (obj.type === 'Identifier' && (obj as any).name === objectName) {
        return true;
    }

    // Nested: core.ChangeDetectionStrategy.OnPush
    if ((obj.type === 'MemberExpression' || obj.type === 'StaticMemberExpression') &&
        (obj as MemberExpression).property.type === 'Identifier' &&
        (obj as MemberExpression).property.name === objectName) {
        return true;
    }

    return false;
};

/**
 * Gets literal string value (unsafe: may return undefined).
 *
 * PERFORMANCE: Returns string reference from AST.
 */
export const getLiteralStringValueUnsafe = (node: Expression): string | undefined => {
    if (!node) return undefined;

    if (node.type === 'StringLiteral' || node.type === 'Literal') {
        const value = (node as any).value;
        return typeof value === 'string' ? value : undefined;
    }

    return undefined;
};

/**
 * Gets literal boolean value (unsafe: may return undefined).
 *
 * PERFORMANCE: Returns boolean primitive from AST.
 */
export const getLiteralBooleanValueUnsafe = (node: Expression): boolean | undefined => {
    if (!node) return undefined;

    if (node.type === 'BooleanLiteral' || node.type === 'Literal') {
        const value = (node as any).value;
        return typeof value === 'boolean' ? value : undefined;
    }

    return undefined;
};
