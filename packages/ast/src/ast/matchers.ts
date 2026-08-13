import type {
  ClassDeclaration,
  Decorator,
  Expression,
  ObjectExpression,
} from '../models/index.js';
import {
  isBooleanLiteral,
  isIdentifier,
  isMemberExpression,
  isObjectExpression,
  isStringLiteral,
} from './node-guards.js';

export const getIdentifierName = (
  node: Expression | undefined
): string | undefined => {
  if (!node || !isIdentifier(node)) return undefined;
  return node.name;
};

export const hasDecorator = (
  classNode: ClassDeclaration,
  decoratorName: string
): boolean => {
  const decorators = classNode.decorators;
  if (!decorators) return false;
  for (let i = 0; i < decorators.length; i++) {
    if (getDecoratorNameUnsafe(decorators[i]) === decoratorName) return true;
  }
  return false;
};

export const getDecoratorNameUnsafe = (
  decorator: Decorator
): string | undefined => {
  const expr = decorator.expression;
  if (!expr || expr.type !== 'CallExpression') return undefined;

  const callee = expr.callee;

  const direct = getIdentifierName(callee);
  if (direct !== undefined) return direct;

  if (isMemberExpression(callee)) {
    return getIdentifierName(callee.property);
  }

  return undefined;
};

export const getDecoratorObjectArgUnsafe = (
  decorator: Decorator
): ObjectExpression | undefined => {
  const expr = decorator.expression;
  if (!expr || expr.type !== 'CallExpression') return undefined;

  const args = expr.arguments;
  if (!args || args.length === 0) return undefined;

  const first = args[0];
  return isObjectExpression(first) ? first : undefined;
};

export const hasObjectProperty = (
  objectExpr: ObjectExpression,
  keyName: string
): boolean => {
  const properties = objectExpr.properties;
  if (!properties) return false;
  for (let i = 0; i < properties.length; i++) {
    const prop = properties[i];
    if (!prop || prop.type === 'SpreadElement') continue;
    if (getKeyNameUnsafe(prop.key) === keyName) return true;
  }
  return false;
};

export const getObjectPropertyUnsafe = (
  objectExpr: ObjectExpression,
  keyName: string
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

export const getKeyNameUnsafe = (key: Expression): string | undefined => {
  if (!key) return undefined;
  const ident = getIdentifierName(key);
  if (ident !== undefined) return ident;
  if (isStringLiteral(key)) {
    return typeof key.value === 'string' ? key.value : undefined;
  }
  return undefined;
};

export const matchesMemberExpression = (
  expr: Expression,
  objectName: string,
  propertyName: string
): boolean => {
  if (!expr) return false;
  if (!isMemberExpression(expr)) return false;

  if (getIdentifierName(expr.property) !== propertyName) return false;

  const obj = expr.object;
  if (!obj) return false;

  if (getIdentifierName(obj) === objectName) return true;

  if (isMemberExpression(obj)) {
    return getIdentifierName(obj.property) === objectName;
  }

  return false;
};

export const getLiteralStringValueUnsafe = (
  node: Expression
): string | undefined => {
  if (!node) return undefined;
  if (!isStringLiteral(node)) return undefined;
  const value = node.value;
  return typeof value === 'string' ? value : undefined;
};

export const getLiteralBooleanValueUnsafe = (
  node: Expression
): boolean | undefined => {
  if (!node) return undefined;
  if (!isBooleanLiteral(node)) return undefined;
  const value = node.value;
  return typeof value === 'boolean' ? value : undefined;
};
