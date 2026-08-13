import type { ParserOptions } from '@ngcompass/common';

export interface ImportGraphResult {
  readonly importGraph: ReadonlyMap<string, ReadonlySet<string>>;
  readonly projectFiles: ReadonlySet<string>;
  readonly rootDir: string;
}

export interface OxcGraphOptions {
  readonly rootDir: string;
  readonly parserOptions?: ParserOptions;
  readonly concurrency?: number;
  readonly onProgress?: (parsed: number, total: number) => void;
}
