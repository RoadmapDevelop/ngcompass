/**
 * Rule Handler Interface (Passive Observers)
 *
 * RULES MUST:
 * - Receive pre-filtered nodes from streams
 * - Return RuleFailure or null (no mutation)
 * - Allocate ZERO structures in handler
 * - Use cached analyzers (never parse)
 *
 * RULES MUST NOT:
 * - Traverse AST
 * - Parse decorators
 * - Resolve imports
 * - Allocate arrays/maps/sets
 * - Call getSourceText()
 */

import { CallExpression, NewExpression } from '@ngcompass/ast';
import type { RuleFailure, RuleContext, RuleMetadata } from '@ngcompass/common';
import type { AngularClassNode, AnyAngularClassNode, DecoratedPropertyNode, TemplateExpressionNode, TemplateAttributeNode } from './node-streams.js';

export type StreamType = 'AngularClass' | 'AnyAngularClass' | 'DecoratedProperty' | 'TemplateExpression' | 'TemplateAttribute' | 'CallExpression' | 'NewExpression';

/**
 * Rule handler for a specific stream type.
 *
 * @template TNode - Node type from stream (pre-filtered, pre-analyzed)
 */
export interface RuleHandler<TNode> {
    readonly name: string;
    readonly streamType: StreamType;

    /**
     * Handles a pre-filtered node.
     *
     * @returns RuleFailure | RuleFailure[] if violation(s) found, null otherwise
     *
     * PERFORMANCE:
     * - Must be O(1) or O(k) where k = small constant
     * - No loops over collections
     * - No allocation
     * - No expensive string operations
     */
    handle(node: TNode, context: RuleContext): RuleFailure | RuleFailure[] | null;
    readonly meta?: Partial<RuleMetadata>;
}

/**
 * Helper to create component rule handlers.
 */
export const createComponentRule = (
    name: string,
    handler: (node: AngularClassNode, context: RuleContext) => RuleFailure | RuleFailure[] | null
): RuleHandler<AngularClassNode> => ({
    name,
    streamType: 'AngularClass',
    handle: handler,
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
    handler: (node: AnyAngularClassNode, context: RuleContext) => RuleFailure | RuleFailure[] | null
): RuleHandler<AnyAngularClassNode> => ({
    name,
    streamType: 'AnyAngularClass',
    handle: handler,
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
