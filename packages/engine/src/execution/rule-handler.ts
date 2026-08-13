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
import type { RuleHandler } from '../models/index.js';

export function createComponentRule(
  name: string,
  handler: (
    node: AngularClassNode,
    context: RuleContext
  ) => RuleFailure | RuleFailure[] | null,
  meta?: Partial<RuleMetadata>
): RuleHandler<AngularClassNode> {
  return {
    name,
    streamType: 'AngularClass',
    handle: handler,
    meta,
  };
}

export function createAnyAngularClassRule(
  name: string,
  handler: (
    node: AnyAngularClassNode,
    context: RuleContext
  ) => RuleFailure | RuleFailure[] | null,
  meta?: Partial<RuleMetadata>
): RuleHandler<AnyAngularClassNode> {
  return {
    name,
    streamType: 'AnyAngularClass',
    handle: handler,
    meta,
  };
}

export function createDecoratedPropertyRule(
  name: string,
  handler: (
    node: DecoratedPropertyNode,
    context: RuleContext
  ) => RuleFailure | RuleFailure[] | null
): RuleHandler<DecoratedPropertyNode> {
  return {
    name,
    streamType: 'DecoratedProperty',
    handle: handler,
  };
}

export function createTemplateExpressionRule(
  name: string,
  handler: (
    node: TemplateExpressionNode,
    context: RuleContext
  ) => RuleFailure | RuleFailure[] | null,
  meta?: Partial<RuleMetadata>
): RuleHandler<TemplateExpressionNode> {
  return {
    name,
    streamType: 'TemplateExpression',
    handle: handler,
    meta,
  };
}

export function createTemplateAttributeRule(
  name: string,
  handler: (
    node: TemplateAttributeNode,
    context: RuleContext
  ) => RuleFailure | RuleFailure[] | null,
  meta?: Partial<RuleMetadata>
): RuleHandler<TemplateAttributeNode> {
  return {
    name,
    streamType: 'TemplateAttribute',
    handle: handler,
    meta,
  };
}

export function createCallExpressionRule(
  name: string,
  handler: (
    node: CallExpression,
    context: RuleContext
  ) => RuleFailure | RuleFailure[] | null,
  meta?: Partial<RuleMetadata>
): RuleHandler<CallExpression> {
  return {
    name,
    streamType: 'CallExpression',
    handle: handler,
    meta,
  };
}

export function createNewExpressionRule(
  name: string,
  handler: (
    node: NewExpression,
    context: RuleContext
  ) => RuleFailure | RuleFailure[] | null,
  meta?: Partial<RuleMetadata>
): RuleHandler<NewExpression> {
  return {
    name,
    streamType: 'NewExpression',
    handle: handler,
    meta,
  };
}

export function createImportDeclarationRule(
  name: string,
  handler: (
    node: ImportDeclaration,
    context: RuleContext
  ) => RuleFailure | RuleFailure[] | null,
  meta?: Partial<RuleMetadata>
): RuleHandler<ImportDeclaration> {
  return {
    name,
    streamType: 'ImportDeclaration',
    handle: handler,
    meta,
  };
}

export function createTemplateBlockRule(
  name: string,
  handler: (
    node: TemplateBlockNode,
    context: RuleContext
  ) => RuleFailure | RuleFailure[] | null,
  meta?: Partial<RuleMetadata>
): RuleHandler<TemplateBlockNode> {
  return {
    name,
    streamType: 'TemplateBlock',
    handle: handler,
    meta,
  };
}

export function createTemplateRule(
  name: string,
  handler: (
    node: TemplateAnalysis,
    context: RuleContext
  ) => RuleFailure | RuleFailure[] | null,
  meta?: Partial<RuleMetadata>
): RuleHandler<TemplateAnalysis> {
  return {
    name,
    streamType: 'Template',
    handle: handler,
    meta,
  };
}
