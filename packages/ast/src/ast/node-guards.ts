import type {
  ArrayExpression,
  BooleanLiteral,
  CallExpression,
  Expression,
  Identifier,
  MemberExpression,
  ObjectExpression,
  StringLiteral,
} from '../models/index.js';

export const isIdentifier = (node: Expression): node is Identifier =>
  node.type === 'Identifier';

export const isCallExpression = (node: Expression): node is CallExpression =>
  node.type === 'CallExpression';

export const isMemberExpression = (
  node: Expression
): node is MemberExpression =>
  node.type === 'MemberExpression' || node.type === 'StaticMemberExpression';

export const isObjectExpression = (
  node: Expression
): node is ObjectExpression => node.type === 'ObjectExpression';

export const isArrayExpression = (node: Expression): node is ArrayExpression =>
  node.type === 'ArrayExpression';

export const isStringLiteral = (node: Expression): node is StringLiteral =>
  node.type === 'StringLiteral' || node.type === 'Literal';

export const isBooleanLiteral = (node: Expression): node is BooleanLiteral =>
  node.type === 'BooleanLiteral' || node.type === 'Literal';
