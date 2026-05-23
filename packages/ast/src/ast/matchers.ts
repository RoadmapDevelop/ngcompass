/**
 * @fileoverview
 * Zero-allocation AST matchers.
 *
 * Pure functions that return primitives or pre-existing AST references —
 * never allocate per call. Designed to be safe to invoke from within the
 * single-pass engine's per-node hot path.
 *
 * Naming convention:
 *  - Functions suffixed with `Unsafe` may return `undefined`; callers must
 *    handle the missing case explicitly.
 *  - Functions without the suffix return primitives (`boolean`, `string | undefined`).
 */

import type {
    BooleanLiteral,
    CallExpression,
    ClassDeclaration,
    Decorator,
    Expression,
    Identifier,
    MemberExpression,
    ObjectExpression,
    StringLiteral,
} from './types.js';

// ── Identifier extraction ──────────────────────────────────────────────────

/**
 * Returns the name of `node` when it is an `Identifier`, otherwise `undefined`.
 * Eliminates the `(node as Identifier).name` ceremony that appears at every
 * caller of the previous matchers.
 */
export const getIdentifierName = (node: Expression | undefined): string | undefined => {
    if (!node || node.type !== 'Identifier') return undefined;
    return (node as Identifier).name;
};

// ── Decorator checks ───────────────────────────────────────────────────────

/**
 * Returns `true` when `classNode` carries a decorator named `decoratorName`.
 * Zero allocations — iterates the decorator array with an index loop.
 */
export const hasDecorator = (classNode: ClassDeclaration, decoratorName: string): boolean => {
    const decorators = classNode.decorators;
    if (!decorators) return false;
    for (let i = 0; i < decorators.length; i++) {
        if (getDecoratorNameUnsafe(decorators[i]) === decoratorName) return true;
    }
    return false;
};

/**
 * Returns the decorator name (`@Foo` → `'Foo'`, `@core.Foo` → `'Foo'`).
 * Returns `undefined` when the decorator expression is shaped unexpectedly.
 */
export const getDecoratorNameUnsafe = (decorator: Decorator): string | undefined => {
    const expr = decorator.expression;
    if (!expr || expr.type !== 'CallExpression') return undefined;

    const callee = (expr as CallExpression).callee;

    // Simple form: @Component(...)
    const direct = getIdentifierName(callee);
    if (direct !== undefined) return direct;

    // Member form: @core.Component(...)
    if (callee.type === 'MemberExpression' || callee.type === 'StaticMemberExpression') {
        return getIdentifierName((callee as MemberExpression).property);
    }

    return undefined;
};

/** Returns the first decorator argument when it is an object literal. */
export const getDecoratorObjectArgUnsafe = (
    decorator: Decorator,
): ObjectExpression | undefined => {
    const expr = decorator.expression;
    if (!expr || expr.type !== 'CallExpression') return undefined;

    const args = (expr as CallExpression).arguments;
    if (!args || args.length === 0) return undefined;

    const first = args[0];
    return first.type === 'ObjectExpression' ? (first as ObjectExpression) : undefined;
};

// ── Object property lookup ─────────────────────────────────────────────────

/** Returns `true` when `objectExpr` declares a property named `keyName`. */
export const hasObjectProperty = (objectExpr: ObjectExpression, keyName: string): boolean => {
    const properties = objectExpr.properties;
    if (!properties) return false;
    for (let i = 0; i < properties.length; i++) {
        const prop = properties[i];
        if (!prop || prop.type === 'SpreadElement') continue;
        if (getKeyNameUnsafe(prop.key) === keyName) return true;
    }
    return false;
};

/** Returns the value expression of the property named `keyName`, if present. */
export const getObjectPropertyUnsafe = (
    objectExpr: ObjectExpression,
    keyName: string,
): Expression | undefined => {
    const properties = objectExpr.properties;
    if (!properties) return undefined;
    for (let i = 0; i < properties.length; i++) {
        const prop = properties[i];
        if (!prop || prop.type === 'SpreadElement') continue;
        if (getKeyNameUnsafe(prop.key) === keyName) return prop.value;
    }
    return undefined;
};

/**
 * Returns the textual key of an object-literal entry — handling identifier
 * keys (`{ foo: … }`) and string-literal keys (`{ "foo": … }`).
 */
export const getKeyNameUnsafe = (key: Expression): string | undefined => {
    if (!key) return undefined;
    const ident = getIdentifierName(key);
    if (ident !== undefined) return ident;
    if (key.type === 'StringLiteral' || key.type === 'Literal') {
        const lit = key as StringLiteral;
        return typeof lit.value === 'string' ? lit.value : undefined;
    }
    return undefined;
};

// ── Member-expression checks ───────────────────────────────────────────────

/**
 * Returns `true` when `expr` is a member expression of the form
 * `objectName.propertyName` (or `something.objectName.propertyName`).
 *
 * Used to detect references like `ChangeDetectionStrategy.OnPush`.
 */
export const matchesMemberExpression = (
    expr: Expression,
    objectName: string,
    propertyName: string,
): boolean => {
    if (!expr) return false;
    if (expr.type !== 'MemberExpression' && expr.type !== 'StaticMemberExpression') return false;

    const memberExpr = expr as MemberExpression;

    // property side: must be `Identifier` with matching name.
    if (getIdentifierName(memberExpr.property) !== propertyName) return false;

    // object side: simple form (Identifier) or nested member form.
    const obj = memberExpr.object;
    if (!obj) return false;

    if (getIdentifierName(obj) === objectName) return true;

    if (obj.type === 'MemberExpression' || obj.type === 'StaticMemberExpression') {
        return getIdentifierName((obj as MemberExpression).property) === objectName;
    }

    return false;
};

// ── Literal extraction ─────────────────────────────────────────────────────

/** Returns the literal string value of `node`, if applicable. */
export const getLiteralStringValueUnsafe = (node: Expression): string | undefined => {
    if (!node) return undefined;
    if (node.type !== 'StringLiteral' && node.type !== 'Literal') return undefined;
    const value = (node as StringLiteral).value;
    return typeof value === 'string' ? value : undefined;
};

/** Returns the literal boolean value of `node`, if applicable. */
export const getLiteralBooleanValueUnsafe = (node: Expression): boolean | undefined => {
    if (!node) return undefined;
    if (node.type !== 'BooleanLiteral' && node.type !== 'Literal') return undefined;
    const value = (node as BooleanLiteral).value;
    return typeof value === 'boolean' ? value : undefined;
};
