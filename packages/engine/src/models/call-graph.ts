import type { FunctionKind } from './ast-node.js';

export interface CallGraphNode {
  readonly id: string;
  readonly name: string;
  readonly kind: FunctionKind;
  readonly line: number;
  readonly column: number;
  readonly endLine: number;
}

export interface CallGraphEdge {
  readonly from: string | null;
  readonly to: string;
  readonly callName: string;
  readonly line: number;
  readonly column: number;
  readonly ambiguous: boolean;
}

export interface ExternalCall {
  readonly from: string | null;
  readonly callName: string;
  readonly line: number;
  readonly column: number;
}

export interface FileCallGraph {
  readonly nodes: readonly CallGraphNode[];
  readonly edges: readonly CallGraphEdge[];
  readonly externalCalls: readonly ExternalCall[];
}
