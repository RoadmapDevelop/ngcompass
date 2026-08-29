import type { TemplateBlock, TemplateBlockParameter } from './template-node.js';

export interface Node {
  readonly type: string;
  readonly span?: { start: number; end: number };
  readonly start?: number;
  readonly end?: number;
}

export interface Identifier extends Node {
  readonly type: 'Identifier';
  readonly name: string;
}

export interface Decorator extends Node {
  readonly type: 'Decorator';
  readonly expression?: CallExpression | Identifier;
}

export interface CallExpression extends Node {
  readonly type: 'CallExpression';
  readonly callee: Expression;
  readonly arguments: ReadonlyArray<Expression>;
}

export interface NewExpression extends Node {
  readonly type: 'NewExpression';
  readonly callee: Expression;
  readonly arguments: ReadonlyArray<Expression>;
}

export interface MemberExpression extends Node {
  readonly type: 'MemberExpression' | 'StaticMemberExpression';
  readonly object: Expression;
  readonly property: Identifier;
}

export interface ObjectExpression extends Node {
  readonly type: 'ObjectExpression';
  readonly properties: ReadonlyArray<ObjectProperty | SpreadElement>;
}

export interface ObjectProperty extends Node {
  readonly type: 'ObjectProperty' | 'Property';
  readonly key: Expression;
  readonly value: Expression;
}

export interface SpreadElement extends Node {
  readonly type: 'SpreadElement';
}

export interface ArrayExpression extends Node {
  readonly type: 'ArrayExpression';
  readonly elements: ReadonlyArray<Expression | SpreadElement | null>;
}

export interface StringLiteral extends Node {
  readonly type: 'StringLiteral' | 'Literal';
  readonly value: string;
}

export interface BooleanLiteral extends Node {
  readonly type: 'BooleanLiteral' | 'Literal';
  readonly value: boolean;
}

export interface ArrowFunctionExpression extends Node {
  readonly type: 'ArrowFunctionExpression';
  readonly body: Expression | BlockStatement;
  readonly expression: boolean;
}

export interface FunctionExpression extends Node {
  readonly type: 'FunctionExpression';
  readonly body: BlockStatement;
}

export interface BlockStatement extends Node {
  readonly type: 'BlockStatement';
  readonly body: ReadonlyArray<Node>;
}

export interface ExpressionStatement extends Node {
  readonly type: 'ExpressionStatement';
  readonly expression: Expression;
}

export interface AssignmentExpression extends Node {
  readonly type: 'AssignmentExpression';
  readonly left: Expression;
  readonly right: Expression;
  readonly operator: string;
}

export interface UpdateExpression extends Node {
  readonly type: 'UpdateExpression';
  readonly operator: string;
  readonly argument: Expression;
  readonly prefix: boolean;
}

export interface IfStatement extends Node {
  readonly type: 'IfStatement';
  readonly test: Expression;
  readonly consequent: Node;
  readonly alternate?: Node;
}

export interface ReturnStatement extends Node {
  readonly type: 'ReturnStatement';
  readonly argument?: Expression;
}

export interface ImportDeclaration extends Node {
  readonly type: 'ImportDeclaration';
  readonly source: StringLiteral;
  readonly specifiers?: ReadonlyArray<Node>;
}

export type Expression =
  | Identifier
  | CallExpression
  | NewExpression
  | MemberExpression
  | ObjectExpression
  | ArrayExpression
  | StringLiteral
  | BooleanLiteral
  | ArrowFunctionExpression
  | FunctionExpression
  | AssignmentExpression
  | UpdateExpression
  | TemplateBlock
  | TemplateBlockParameter
  | Node;
