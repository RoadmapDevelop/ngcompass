import type { Decorator, Expression, Identifier, Node } from './ts-node.js';

export interface ClassDeclaration extends Node {
  readonly type: 'ClassDeclaration';
  readonly id?: Identifier;
  readonly decorators?: ReadonlyArray<Decorator>;
  readonly body?: ClassBody;
}

export interface ClassBody extends Node {
  readonly type: 'ClassBody';
  readonly body: ReadonlyArray<PropertyDefinition | MethodDefinition>;
}

export interface PropertyDefinition extends Node {
  readonly type: 'PropertyDefinition';
  readonly key: Expression;
  readonly value?: Expression;
  readonly decorators?: ReadonlyArray<Decorator>;
}

export interface MethodDefinition extends Node {
  readonly type: 'MethodDefinition';
  readonly key: Expression;
}
