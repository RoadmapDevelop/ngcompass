import type { RuleContext, RuleFailure, RuleMetadata } from '@ngcompass/common';

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

export interface RuleHandler<TNode> {
  readonly name: string;
  readonly streamType: StreamType;

  handle(node: TNode, context: RuleContext): RuleFailure | RuleFailure[] | null;
  readonly meta?: Partial<RuleMetadata>;
}
