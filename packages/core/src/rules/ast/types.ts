/**
 * Minimal AST Type Definitions (Zero-Copy, ESTree-like)
 *
 * These types match Oxc's ESTree-compatible AST structure.
 * Only include fields we actually use to minimize overhead.
 */

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

export type Expression =
    | Identifier
    | CallExpression
    | MemberExpression
    | ObjectExpression
    | ArrayExpression
    | StringLiteral
    | BooleanLiteral
    | Node;
