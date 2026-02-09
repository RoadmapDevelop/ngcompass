import { RuleResult, RuleContext, RuleFailure } from "../types.js";
import { Locator } from "../../utils/locator.js";
import { walkProgram } from "../visitor.js";

/**
 * Enforces ChangeDetectionStrategy.OnPush on Angular components.
 *
 * Oxc implementation notes:
 * - Object literal property keys may be Identifier or StringLiteral/Literal.
 * - Object literal properties may not always be "ObjectProperty" by name; rely on structural checks.
 * - Member expressions can vary (MemberExpression, StaticMemberExpression) and property nodes may differ.
 * - Some codebases use aliases (e.g., `OnPush`) or namespace imports (`core.ChangeDetectionStrategy.OnPush`).
 */
export const preferOnPush = (context: RuleContext): RuleResult => {
    const ruleName = "prefer-on-push-component-change-detection";
    const { program, fileContent, filePath } = context;

    if (!program) return { ruleName, failures: [] };

    const locator = new Locator(fileContent);
    const failures: RuleFailure[] = [];

    walkProgram(program, (node) => {
        if (node?.type !== "ClassDeclaration") return;
        checkClassDeclaration(node, filePath, locator, failures, ruleName);
    });

    return { ruleName, failures };
};

/**
 * Checks a class declaration for an Angular @Component decorator and validates changeDetection.
 *
 * @param node - ClassDeclaration node
 * @param filePath - File path for reporting
 * @param locator - Locator for line/column mapping
 * @param failures - Accumulator for failures
 * @param ruleName - Rule name
 */
const checkClassDeclaration = (
    node: any,
    filePath: string,
    locator: Locator,
    failures: RuleFailure[],
    ruleName: string
): void => {
    const decorators = node?.decorators;
    if (!Array.isArray(decorators) || decorators.length === 0) return;

    const componentDecorator = findComponentDecorator(decorators);
    if (!componentDecorator) return;

    const objectArg = getFirstObjectArgument(componentDecorator);
    if (!objectArg) return;

    const hasOnPush = hasOnPushChangeDetection(objectArg);
    if (hasOnPush) return;

    const start = componentDecorator?.span?.start ?? node?.span?.start ?? 0;
    const { line, column } = locator.location(start);

    failures.push({
        filePath,
        message: `Component '${node?.id?.name ?? "Unknown"}' should use ChangeDetectionStrategy.OnPush`,
        line,
        column,
        severity: "critical",
        ruleName,
    });
};

/**
 * Locates the @Component(...) decorator call from a decorators list.
 *
 * @param decorators - Decorators array
 * @returns Decorator node or null
 */
const findComponentDecorator = (decorators: any[]): any | null => {
    for (const d of decorators) {
        const call = getDecoratorCallExpression(d);
        if (!call) continue;

        const calleeName = getCalleeIdentifierName(call?.callee);
        if (calleeName === "Component") return d;
    }
    return null;
};

/**
 * Extracts a call expression from a decorator node.
 *
 * @param decorator - Decorator node
 * @returns CallExpression node or null
 */
const getDecoratorCallExpression = (decorator: any): any | null => {
    const expr = decorator?.expression ?? decorator?.expr ?? decorator?.callee;
    if (!expr) return null;
    if (expr.type === "CallExpression") return expr;
    return null;
};

/**
 * Reads the identifier name of a call callee.
 *
 * @param callee - CallExpression.callee node
 * @returns Identifier name or null
 */
const getCalleeIdentifierName = (callee: any): string | null => {
    if (!callee) return null;
    if (callee.type === "Identifier") return callee.name ?? null;

    if (callee.type === "MemberExpression" || callee.type === "StaticMemberExpression") {
        return getPropertyName(callee.property);
    }

    return null;
};

/**
 * Gets the first decorator argument if it is an object literal.
 *
 * @param decorator - Decorator node
 * @returns ObjectExpression node or null
 */
const getFirstObjectArgument = (decorator: any): any | null => {
    const call = getDecoratorCallExpression(decorator);
    const args = call?.arguments;
    if (!Array.isArray(args) || args.length === 0) return null;

    const first = args[0];
    if (first?.type === "ObjectExpression") return first;

    return null;
};

/**
 * Determines whether the component metadata object contains changeDetection: OnPush.
 *
 * @param objectExpression - ObjectExpression node
 * @returns true if OnPush is configured
 */
const hasOnPushChangeDetection = (objectExpression: any): boolean => {
    const properties = objectExpression?.properties;
    if (!Array.isArray(properties) || properties.length === 0) return false;

    const changeDetectionValue = findObjectPropertyValue(properties, "changeDetection");
    if (!changeDetectionValue) return false;

    return isOnPushExpression(changeDetectionValue);
};

/**
 * Finds an object's property value by key name, supporting Identifier and string-like keys.
 *
 * @param properties - ObjectExpression.properties
 * @param keyName - Target key name
 * @returns Value node or null
 */
const findObjectPropertyValue = (properties: any[], keyName: string): any | null => {
    for (const prop of properties) {
        const value = getPropertyValueNode(prop);
        if (!value) continue;

        const key = getPropertyKeyNode(prop);
        if (!key) continue;

        const name = getKeyName(key);
        if (name === keyName) return value;
    }
    return null;
};

/**
 * Extracts a property key node from an object property-like node.
 *
 * @param prop - Object property node
 * @returns Key node or null
 */
const getPropertyKeyNode = (prop: any): any | null => {
    if (!prop) return null;
    if ("key" in prop) return prop.key ?? null;
    return null;
};

/**
 * Extracts a property value node from an object property-like node.
 *
 * @param prop - Object property node
 * @returns Value node or null
 */
const getPropertyValueNode = (prop: any): any | null => {
    if (!prop) return null;
    if ("value" in prop) return prop.value ?? null;
    return null;
};

/**
 * Normalizes a key node into a string key name.
 *
 * @param key - Key node
 * @returns Key name or null
 */
const getKeyName = (key: any): string | null => {
    if (!key) return null;

    if (key.type === "Identifier") return key.name ?? null;

    const literalValue = getLiteralStringValue(key);
    if (literalValue !== null) return literalValue;

    return null;
};

/**
 * Reads string value from common literal node shapes.
 *
 * @param node - Literal-like node
 * @returns String value or null
 */
const getLiteralStringValue = (node: any): string | null => {
    if (!node) return null;

    if (node.type === "StringLiteral") return node.value ?? null;
    if (node.type === "Literal" && typeof node.value === "string") return node.value;

    return null;
};

/**
 * Evaluates whether an expression represents OnPush.
 *
 * Accepted patterns:
 * - ChangeDetectionStrategy.OnPush
 * - <namespace>.ChangeDetectionStrategy.OnPush
 * - OnPush (imported alias)
 *
 * @param expr - Expression node
 * @returns true if expression matches OnPush semantics
 */
const isOnPushExpression = (expr: any): boolean => {
    if (!expr) return false;

    if (expr.type === "Identifier") {
        return expr.name === "OnPush";
    }

    if (expr.type === "MemberExpression" || expr.type === "StaticMemberExpression") {
        return isOnPushMemberExpression(expr);
    }

    return false;
};

/**
 * Evaluates whether a member expression resolves to ChangeDetectionStrategy.OnPush.
 *
 * @param expr - Member expression node
 * @returns true if it matches ChangeDetectionStrategy.OnPush
 */
const isOnPushMemberExpression = (expr: any): boolean => {
    const property = getPropertyName(expr.property);
    if (property !== "OnPush") return false;

    return isChangeDetectionStrategyObject(expr.object);
};

/**
 * Extracts the property name from a member expression property node.
 *
 * @param prop - Property node
 * @returns Property name or null
 */
const getPropertyName = (prop: any): string | null => {
    if (!prop) return null;

    if (prop.type === "Identifier") return prop.name ?? null;

    const literalValue = getLiteralStringValue(prop);
    if (literalValue !== null) return literalValue;

    return prop.name ?? null;
};

/**
 * Evaluates whether an expression represents ChangeDetectionStrategy or a namespace-qualified variant.
 *
 * Accepted patterns:
 * - ChangeDetectionStrategy
 * - <namespace>.ChangeDetectionStrategy
 *
 * @param expr - Expression node
 * @returns true if it matches ChangeDetectionStrategy
 */
const isChangeDetectionStrategyObject = (expr: any): boolean => {
    if (!expr) return false;

    if (expr.type === "Identifier") {
        return expr.name === "ChangeDetectionStrategy";
    }

    if (expr.type === "MemberExpression" || expr.type === "StaticMemberExpression") {
        const prop = getPropertyName(expr.property);
        return prop === "ChangeDetectionStrategy";
    }

    return false;
};
