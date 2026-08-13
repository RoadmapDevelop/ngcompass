import type { RuleFailure, RuleContext } from '@ngcompass/common';
import type {
  AngularClassNode,
  AnyAngularClassNode,
  DecoratedPropertyNode,
  TemplateExpressionNode,
  TemplateAttributeNode,
  TemplateBlockNode,
  TemplateAnalysis,
} from '@ngcompass/ast';
import type {
  CallExpression,
  ImportDeclaration,
  NewExpression,
} from '@ngcompass/ast';
import { RuleMetadata } from '@ngcompass/common';
import type { RuleHandler } from './models/index.js';

export const createComponentRule = (
  name: string,
  handler: (
    node: AngularClassNode,
    context: RuleContext
  ) => RuleFailure | RuleFailure[] | null,
  meta?: Partial<RuleMetadata>
): RuleHandler<AngularClassNode> => ({
  name,
  streamType: 'AngularClass',
  handle: handler,
  meta,
});

export const createAnyAngularClassRule = (
  name: string,
  handler: (
    node: AnyAngularClassNode,
    context: RuleContext
  ) => RuleFailure | RuleFailure[] | null,
  meta?: Partial<RuleMetadata>
): RuleHandler<AnyAngularClassNode> => ({
  name,
  streamType: 'AnyAngularClass',
  handle: handler,
  meta,
});

export const createDecoratedPropertyRule = (
  name: string,
  handler: (
    node: DecoratedPropertyNode,
    context: RuleContext
  ) => RuleFailure | RuleFailure[] | null
): RuleHandler<DecoratedPropertyNode> => ({
  name,
  streamType: 'DecoratedProperty',
  handle: handler,
});

export const createTemplateExpressionRule = (
  name: string,
  handler: (
    node: TemplateExpressionNode,
    context: RuleContext
  ) => RuleFailure | RuleFailure[] | null,
  meta?: Partial<RuleMetadata>
): RuleHandler<TemplateExpressionNode> => ({
  name,
  streamType: 'TemplateExpression',
  handle: handler,
  meta,
});

export const createTemplateAttributeRule = (
  name: string,
  handler: (
    node: TemplateAttributeNode,
    context: RuleContext
  ) => RuleFailure | RuleFailure[] | null,
  meta?: Partial<RuleMetadata>
): RuleHandler<TemplateAttributeNode> => ({
  name,
  streamType: 'TemplateAttribute',
  handle: handler,
  meta,
});

export const createCallExpressionRule = (
  name: string,
  handler: (
    node: CallExpression,
    context: RuleContext
  ) => RuleFailure | RuleFailure[] | null,
  meta?: Partial<RuleMetadata>
): RuleHandler<CallExpression> => ({
  name,
  streamType: 'CallExpression',
  handle: handler,
  meta,
});

export const createNewExpressionRule = (
  name: string,
  handler: (
    node: NewExpression,
    context: RuleContext
  ) => RuleFailure | RuleFailure[] | null,
  meta?: Partial<RuleMetadata>
): RuleHandler<NewExpression> => ({
  name,
  streamType: 'NewExpression',
  handle: handler,
  meta,
});

export const createImportDeclarationRule = (
  name: string,
  handler: (
    node: ImportDeclaration,
    context: RuleContext
  ) => RuleFailure | RuleFailure[] | null,
  meta?: Partial<RuleMetadata>
): RuleHandler<ImportDeclaration> => ({
  name,
  streamType: 'ImportDeclaration',
  handle: handler,
  meta,
});

export const createTemplateBlockRule = (
  name: string,
  handler: (
    node: TemplateBlockNode,
    context: RuleContext
  ) => RuleFailure | RuleFailure[] | null,
  meta?: Partial<RuleMetadata>
): RuleHandler<TemplateBlockNode> => ({
  name,
  streamType: 'TemplateBlock',
  handle: handler,
  meta,
});

export const createTemplateRule = (
  name: string,
  handler: (
    node: TemplateAnalysis,
    context: RuleContext
  ) => RuleFailure | RuleFailure[] | null,
  meta?: Partial<RuleMetadata>
): RuleHandler<TemplateAnalysis> => ({
  name,
  streamType: 'Template',
  handle: handler,
  meta,
});
