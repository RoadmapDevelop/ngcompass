export interface AstNode {
  readonly type?: string;
  readonly start?: number;
  readonly end?: number;
  readonly span?: { start: number; end: number };
  readonly name?: string;
  readonly value?: unknown;
  readonly computed?: boolean;
  readonly operator?: string;
  readonly accessibility?: string;
  readonly readonly?: boolean;
  readonly static?: boolean;
  readonly kind?: string;
  readonly expression?: AstNode;
  readonly callee?: AstNode;
  readonly object?: AstNode;
  readonly property?: AstNode;
  readonly arguments?: AstNode[];
  readonly properties?: AstNode[];
  readonly elements?: AstNode[];
  readonly body?: AstNode | AstNode[] | { body?: AstNode[] };
  readonly params?: AstNode[] | { items?: AstNode[]; elements?: AstNode[] };
  readonly key?: AstNode;
  readonly left?: AstNode;
  readonly right?: AstNode;
  readonly test?: AstNode;
  readonly consequent?: AstNode;
  readonly alternate?: AstNode;
  readonly argument?: AstNode;
  readonly decorators?: AstNode[];
  readonly typeAnnotation?: AstNode;
  readonly typeName?: AstNode;
  readonly initializer?: AstNode;
  readonly parent?: AstNode;
  [key: string]: unknown;
}

export type MaybeAstNode = AstNode | null | undefined;
