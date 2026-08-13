import type { FunctionKind } from './ast-node.js';

export interface FunctionComplexity {
  readonly name: string;
  readonly kind: FunctionKind;
  readonly line: number;
  readonly column: number;
  readonly endLine: number;
  readonly lineCount: number;
  readonly cyclomatic: number;
  readonly cognitive: number;
}

export interface ProjectComplexityOptions {
  readonly rootDir: string;
  readonly concurrency?: number;
  readonly onProgress?: (parsed: number, total: number) => void;
}

export interface FileComplexity {
  readonly filePath: string;
  readonly functions: readonly FunctionComplexity[];
}
