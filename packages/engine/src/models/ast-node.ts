export type FunctionKind =
  | 'function'
  | 'method'
  | 'getter'
  | 'setter'
  | 'constructor'
  | 'arrow';

export interface AstNodeLike {
  readonly type: string;
  readonly [key: string]: unknown;
}

export interface NamedFunction {
  readonly name: string;
  readonly kind: FunctionKind;
}

export type NodeVisitor = (
  node: AstNodeLike,
  parent: AstNodeLike | undefined
) => void;
