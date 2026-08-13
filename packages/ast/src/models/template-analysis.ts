import type { Expression } from './ts-node.js';

export interface TemplateExpressionNode {
  readonly expression: Expression;
  readonly sourceSpan: { start: number; end: number };
}

export interface TemplateAttributeNode {
  readonly name: string;
  readonly value?: string;
  readonly sourceSpan: { start: number; end: number };
}

export interface TemplateBlockNode {
  readonly name: string;
  readonly parameters: ReadonlyArray<{
    readonly expression: string;
    readonly sourceSpan: { start: number; end: number };
  }>;
  readonly sourceSpan: { start: number; end: number };
}

export interface TemplateAnalysis {
  readonly expressions: ReadonlyArray<TemplateExpressionNode>;
  readonly attributes: ReadonlyArray<TemplateAttributeNode>;
  readonly blocks: ReadonlyArray<TemplateBlockNode>;
}
