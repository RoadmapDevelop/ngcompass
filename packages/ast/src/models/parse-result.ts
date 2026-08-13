import type { Program } from 'oxc-parser';

export interface TsParserResult {
  program: Program;
  errors: unknown[];
}

export interface HtmlParserResult {
  readonly rootNodes: ReadonlyArray<unknown>;
  readonly errors: ReadonlyArray<unknown>;

  readonly templateStartOffset: number;
}

export interface CssParserResult {
  code: Buffer | Uint8Array;
  map?: Buffer | Uint8Array | void;
}

export type CssResult =
  | { ok: true; code: Buffer | Uint8Array; map?: Buffer | Uint8Array | void }
  | { ok: false; error: unknown };

export interface ExtractedTemplate {
  readonly content: string;

  readonly startOffset: number;
}
