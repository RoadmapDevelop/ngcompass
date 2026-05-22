/**

* @fileoverview
 * Minimal AST type definitions.
 *
 * These interfaces mirror the relevant subset of Oxc's ESTree-compatible AST
 * shape so the rest of the package (matchers, analyzers, streams) can be
 * typed without depending on the full Oxc type tree. Only the fields we
 * actually read are declared — keeping the surface narrow makes accidental
 * coupling visible at compile time.
 *
 * Both `start`/`end` (Oxc-style) and `span: {start, end}` (some older nodes)
 * are accepted; consumers should use {@link nodeStart} / {@link nodeEnd}
 * helpers below rather than reading either field directly.
 */

/** Base AST node. Every concrete node carries a discriminant `type` string. */
export interface Node {
    readonly type: string;
    readonly span?: { start: number; end: number };
    readonly start?: number;
    readonly end?: number;
}

/**
 * Returns the start offset of an AST node, accepting either field layout
 * (`start` or `span.start`) and defaulting to `0` when neither is present.
 */
export const nodeStart = (node: Pick<Node, 'start' | 'span'>): number =>
    node.start ?? node.span?.start ?? 0;

/**
 * Returns the end offset of an AST node, accepting either field layout
 * (`end` or `span.end`) and defaulting to `0` when neither is present.
 */
export const nodeEnd = (node: Pick<Node, 'end' | 'span'>): number =>
    node.end ?? node.span?.end ?? 0;

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

export interface TemplateBlock extends Node {
    readonly type: 'Block';
    readonly name: string;
    readonly parameters: ReadonlyArray<TemplateBlockParameter>;
    readonly children: ReadonlyArray<Node>;
}

export interface TemplateBlockParameter extends Node {
    readonly type: 'BlockParameter';
    readonly expression: string;
}

/**
 * Union of expression-position nodes the matchers reason about.
 *
 * The trailing `Node` fallback is retained on purpose — Oxc occasionally
 * produces shapes we have not yet enumerated here (e.g. `ChainExpression`,
 * `TSAsExpression`); rather than refuse to typecheck, callers receive
 * `Node` and rely on the explicit `node.type === '…'` discrimination they
 * already perform.
 */
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
