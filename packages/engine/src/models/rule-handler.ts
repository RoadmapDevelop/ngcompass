import type { RuleContext, RuleFailure, RuleMetadata } from '@ngcompass/common';
import type {
  AngularClassNode,
  AnyAngularClassNode,
  CallExpression,
  ClassDeclaration,
  DecoratedPropertyNode,
  ImportDeclaration,
  NewExpression,
  PropertyDefinition,
  TemplateAnalysis,
  TemplateAttributeNode,
  TemplateBlockNode,
  TemplateExpressionNode,
} from '@ngcompass/ast';

export type StreamType =
  | 'AngularClass'
  | 'AnyAngularClass'
  | 'DecoratedProperty'
  | 'TemplateExpression'
  | 'TemplateAttribute'
  | 'TemplateBlock'
  | 'Template'
  | 'CallExpression'
  | 'NewExpression'
  | 'ImportDeclaration';

export interface StreamNodeMap {
  AngularClass: AngularClassNode;
  AnyAngularClass: AnyAngularClassNode;
  DecoratedProperty: DecoratedPropertyNode;
  TemplateExpression: TemplateExpressionNode;
  TemplateAttribute: TemplateAttributeNode;
  TemplateBlock: TemplateBlockNode;
  Template: TemplateAnalysis;
  CallExpression: CallExpression;
  NewExpression: NewExpression;
  ImportDeclaration: ImportDeclaration;
}

export interface StreamSourceMap {
  AngularClass: ClassDeclaration;
  AnyAngularClass: ClassDeclaration;
  DecoratedProperty: PropertyDefinition;
  TemplateExpression: TemplateExpressionNode;
  TemplateAttribute: TemplateAttributeNode;
  TemplateBlock: TemplateBlockNode;
  Template: TemplateAnalysis;
  CallExpression: CallExpression;
  NewExpression: NewExpression;
  ImportDeclaration: ImportDeclaration;
}

export type StreamNode = StreamNodeMap[StreamType];

export type StreamFilters = Partial<{
  [S in StreamType]: (rawNode: StreamSourceMap[S]) => StreamNodeMap[S] | null;
}>;

export interface RuleHandler<TNode> {
  readonly name: string;
  readonly streamType: StreamType;

  handle(node: TNode, context: RuleContext): RuleFailure | RuleFailure[] | null;
  readonly meta?: Partial<RuleMetadata>;
}
