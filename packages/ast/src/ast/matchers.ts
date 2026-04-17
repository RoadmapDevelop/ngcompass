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
    MemberExpression,
    CallExpression,
    Identifier,
    StringLiteral,
    BooleanLiteral,
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
            return (callee as Identifier).name;
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
        if (!prop || prop.type === 'SpreadElement') continue;

        const objectProp = prop;
        const actualKeyName = getKeyNameUnsafe(objectProp.key);

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
        if (!prop || prop.type === 'SpreadElement') continue;

        const objectProp = prop;
        const actualKeyName = getKeyNameUnsafe(objectProp.key);

        if (actualKeyName === keyName) {
            return objectProp.value;
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
    if (key.type === 'Identifier') return (key as Identifier).name;

    // String literal: { "foo": ... }
    if (key.type === 'StringLiteral' || key.type === 'Literal') {
        const lit = key as StringLiteral;
        return typeof lit.value === 'string' ? lit.value : undefined;
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
    if (obj.type === 'Identifier' && (obj as Identifier).name === objectName) {
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
        const value = (node as StringLiteral).value;
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
        const value = (node as BooleanLiteral).value;
        return typeof value === 'boolean' ? value : undefined;
    }

    return undefined;
};

/**
 * Checks if expression is an Angular input() signal call.
 */
export const isInputSignal = (expr: Expression): boolean => {
    if (!expr || expr.type !== 'CallExpression') return false;
    const callee = (expr as CallExpression).callee;

    // input()
    if (callee.type === 'Identifier' && (callee as Identifier).name === 'input') return true;

    // input.required()
    if (callee.type === 'MemberExpression' || callee.type === 'StaticMemberExpression') {
        const member = callee as MemberExpression;
        return member.object.type === 'Identifier' &&
            (member.object as Identifier).name === 'input' &&
            member.property.type === 'Identifier' &&
            member.property.name === 'required';
    }

    return false;
};

/**
 * Extracts alias from input() signal call if present.
 */
export const getInputSignalAliasUnsafe = (callExpr: CallExpression): string | undefined => {
    const callee = callExpr.callee;
    const args = callExpr.arguments;
    if (!args || args.length === 0) return undefined;

    const isRequired = callee.type === 'MemberExpression' || callee.type === 'StaticMemberExpression';

    return isRequired
        ? getRequiredInputAlias(args)
        : getOptionalInputAlias(args);
};

/** Extracts alias from input.required({ alias: 'alias' }). */
const getRequiredInputAlias = (args: readonly any[]): string | undefined => {
    const first = args[0];
    if (!first || first.type !== 'ObjectExpression') return undefined;
    return getLiteralStringValueUnsafe(
        getObjectPropertyUnsafe(first as ObjectExpression, 'alias') as Expression,
    );
};

/** Extracts alias from input('alias') or input(defaultVal, { alias: 'alias' }). */
const getOptionalInputAlias = (args: readonly any[]): string | undefined => {
    if (args.length === 1) {
        const first = args[0];
        if (first.type === 'StringLiteral' || first.type === 'Literal') {
            return getLiteralStringValueUnsafe(first);
        }
    }

    if (args.length >= 2) {
        const second = args[1];
        if (second && second.type === 'ObjectExpression') {
            return getLiteralStringValueUnsafe(
                getObjectPropertyUnsafe(second as ObjectExpression, 'alias') as Expression,
            );
        }
    }

    return undefined;
};
