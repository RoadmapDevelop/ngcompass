export interface TemplateAst {
  readonly rootNodes: ReadonlyArray<unknown>;

  readonly errors: ReadonlyArray<unknown>;

  readonly templateStartOffset: number;
}

export interface StyleAst {
  readonly ok: boolean;

  readonly code?: Buffer | Uint8Array;

  readonly error?: unknown;
}
