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
} from '../models/index.js';

export const getIdentifierName = (
  node: Expression | undefined
): string | undefined => {
  if (!node || node.type !== 'Identifier') return undefined;
  return (node as Identifier).name;
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

  const callee = (expr as CallExpression).callee;

  const direct = getIdentifierName(callee);
  if (direct !== undefined) return direct;

  if (
    callee.type === 'MemberExpression' ||
    callee.type === 'StaticMemberExpression'
  ) {
    return getIdentifierName((callee as MemberExpression).property);
  }

  return undefined;
};

export const getDecoratorObjectArgUnsafe = (
  decorator: Decorator
): ObjectExpression | undefined => {
  const expr = decorator.expression;
  if (!expr || expr.type !== 'CallExpression') return undefined;

  const args = (expr as CallExpression).arguments;
  if (!args || args.length === 0) return undefined;

  const first = args[0];
  return first.type === 'ObjectExpression'
    ? (first as ObjectExpression)
    : undefined;
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
  if (key.type === 'StringLiteral' || key.type === 'Literal') {
    const lit = key as StringLiteral;
    return typeof lit.value === 'string' ? lit.value : undefined;
  }
  return undefined;
};

export const matchesMemberExpression = (
  expr: Expression,
  objectName: string,
  propertyName: string
): boolean => {
  if (!expr) return false;
  if (
    expr.type !== 'MemberExpression' &&
    expr.type !== 'StaticMemberExpression'
  )
    return false;

  const memberExpr = expr as MemberExpression;

  if (getIdentifierName(memberExpr.property) !== propertyName) return false;

  const obj = memberExpr.object;
  if (!obj) return false;

  if (getIdentifierName(obj) === objectName) return true;

  if (
    obj.type === 'MemberExpression' ||
    obj.type === 'StaticMemberExpression'
  ) {
    return getIdentifierName((obj as MemberExpression).property) === objectName;
  }

  return false;
};

export const getLiteralStringValueUnsafe = (
  node: Expression
): string | undefined => {
  if (!node) return undefined;
  if (node.type !== 'StringLiteral' && node.type !== 'Literal')
    return undefined;
  const value = (node as StringLiteral).value;
  return typeof value === 'string' ? value : undefined;
};

export const getLiteralBooleanValueUnsafe = (
  node: Expression
): boolean | undefined => {
  if (!node) return undefined;
  if (node.type !== 'BooleanLiteral' && node.type !== 'Literal')
    return undefined;
  const value = (node as BooleanLiteral).value;
  return typeof value === 'boolean' ? value : undefined;
};
