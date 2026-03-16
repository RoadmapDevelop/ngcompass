/**
 * @fileoverview
 * Facilitates the definition of analytical rules as passive observers.
 *
 * Rules implemented via this interface are designed for maximum performance,
 * operating on pre-filtered node streams without performing independent
 * AST traversals or resource allocations.
 */

import type { RuleFailure, RuleContext } from './types.js';
import type { AngularClassNode, AnyAngularClassNode, DecoratedPropertyNode, TemplateExpressionNode, TemplateAttributeNode, TemplateBlockNode, TemplateAnalysis } from '@ngcompass/ast';
import type { CallExpression, NewExpression } from '@ngcompass/ast';
import { RuleMetadata } from '@ngcompass/common';

export type StreamType = 'AngularClass' | 'AnyAngularClass' | 'DecoratedProperty' | 'TemplateExpression' | 'TemplateAttribute' | 'TemplateBlock' | 'Template' | 'CallExpression' | 'NewExpression';

/**
 * Rule handler for a specific stream type.
 *
 * @template TNode - Node type from stream (pre-filtered, pre-analyzed)
 */
export interface RuleHandler<TNode> {
    readonly name: string;
    readonly streamType: StreamType;

    /**
     * Evaluates a node from a pre-filtered analytical stream.
     *
     * Implementation must adhere to strict performance constraints, ensuring
     * O(1) or near-constant time complexity and zero memory allocation.
     *
     * @param node The pre-analyzed AST node to evaluate.
     * @param context The analytical context for the current file.
     * @returns A rule failure, a collection of failures, or null if compliant.
     */
    handle(node: TNode, context: RuleContext): RuleFailure | RuleFailure[] | null;
    readonly meta?: Partial<RuleMetadata>;
}

/**
 * Helper to create component rule handlers.
 */
export const createComponentRule = (
    name: string,
    handler: (node: AngularClassNode, context: RuleContext) => RuleFailure | RuleFailure[] | null,
    meta?: Partial<RuleMetadata>
): RuleHandler<AngularClassNode> => ({
    name,
    streamType: 'AngularClass',
    handle: handler,
    meta,
});

/**
 * Helper to create rules that handle ANY Angular-decorated class:
 * @Component, @Directive, @Pipe, @Injectable, @NgModule.
 *
 * Use this instead of createComponentRule when the rule applies to
 * classes beyond just @Component and @Directive.
 */
export const createAnyAngularClassRule = (
    name: string,
    handler: (node: AnyAngularClassNode, context: RuleContext) => RuleFailure | RuleFailure[] | null,
    meta?: Partial<RuleMetadata>
): RuleHandler<AnyAngularClassNode> => ({
    name,
    streamType: 'AnyAngularClass',
    handle: handler,
    meta,
});

/**
 * Helper to create decorated property rule handlers.
 */
export const createDecoratedPropertyRule = (
    name: string,
    handler: (node: DecoratedPropertyNode, context: RuleContext) => RuleFailure | RuleFailure[] | null
): RuleHandler<DecoratedPropertyNode> => ({
    name,
    streamType: 'DecoratedProperty',
    handle: handler,
});

/**
 * Helper to create template expression rule handlers.
 */
export const createTemplateExpressionRule = (
    name: string,
    handler: (node: TemplateExpressionNode, context: RuleContext) => RuleFailure | RuleFailure[] | null,
    meta?: Partial<RuleMetadata>
): RuleHandler<TemplateExpressionNode> => ({
    name,
    streamType: 'TemplateExpression',
    handle: handler,
    meta,
});

/**
 * Helper to create template attribute rule handlers.
 */
export const createTemplateAttributeRule = (
    name: string,
    handler: (node: TemplateAttributeNode, context: RuleContext) => RuleFailure | RuleFailure[] | null,
    meta?: Partial<RuleMetadata>
): RuleHandler<TemplateAttributeNode> => ({
    name,
    streamType: 'TemplateAttribute',
    handle: handler,
    meta,
});

/**
 * Helper to create call expression rule handlers.
 *
 * Receives every CallExpression node in the file's AST exactly once.
 * The handler is responsible for its own callee-shape filtering
 * (e.g. checking for a StaticMemberExpression callee and a specific method name).
 */
export const createCallExpressionRule = (
    name: string,
    handler: (node: CallExpression, context: RuleContext) => RuleFailure | RuleFailure[] | null,
    meta?: Partial<RuleMetadata>
): RuleHandler<CallExpression> => ({
    name,
    streamType: 'CallExpression',
    handle: handler,
    meta,
});

/**
 * Helper to create new expression rule handlers.
 */
export const createNewExpressionRule = (
    name: string,
    handler: (node: NewExpression, context: RuleContext) => RuleFailure | RuleFailure[] | null,
    meta?: Partial<RuleMetadata>
): RuleHandler<NewExpression> => ({
    name,
    streamType: 'NewExpression',
    handle: handler,
    meta,
});

/**
 * Helper to create template block rule handlers.
 */
export const createTemplateBlockRule = (
    name: string,
    handler: (node: TemplateBlockNode, context: RuleContext) => RuleFailure | RuleFailure[] | null,
    meta?: Partial<RuleMetadata>
): RuleHandler<TemplateBlockNode> => ({
    name,
    streamType: 'TemplateBlock',
    handle: handler,
    meta,
});

/**
 * Helper to create template rules that receive the full template analysis.
 */
export const createTemplateRule = (
    name: string,
    handler: (node: TemplateAnalysis, context: RuleContext) => RuleFailure | RuleFailure[] | null,
    meta?: Partial<RuleMetadata>
): RuleHandler<TemplateAnalysis> => ({
    name,
    streamType: 'Template',
    handle: handler,
    meta,
});

