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

import type { RuleFailure, RuleContext } from '../types.js';
import type { AngularComponentNode, DecoratedPropertyNode, TemplateExpressionNode, TemplateAttributeNode } from './node-streams.js';

export type StreamType = 'AngularComponent' | 'DecoratedProperty' | 'TemplateExpression' | 'TemplateAttribute';

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
     * @returns RuleFailure if violation found, null otherwise
     *
     * PERFORMANCE:
     * - Must be O(1) or O(k) where k = small constant
     * - No loops over collections
     * - No allocation
     * - No expensive string operations
     */
    handle(node: TNode, context: RuleContext): RuleFailure | null;
    readonly meta?: Partial<import('../types.js').RuleMetadata>;
}

/**
 * Helper to create component rule handlers.
 */
export const createComponentRule = (
    name: string,
    handler: (node: AngularComponentNode, context: RuleContext) => RuleFailure | null
): RuleHandler<AngularComponentNode> => ({
    name,
    streamType: 'AngularComponent',
    handle: handler,
});

/**
 * Helper to create decorated property rule handlers.
 */
export const createDecoratedPropertyRule = (
    name: string,
    handler: (node: DecoratedPropertyNode, context: RuleContext) => RuleFailure | null
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
    handler: (node: TemplateExpressionNode, context: RuleContext) => RuleFailure | null,
    meta?: Partial<import('../types.js').RuleMetadata>
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
    handler: (node: TemplateAttributeNode, context: RuleContext) => RuleFailure | null,
    meta?: Partial<import('../types.js').RuleMetadata>
): RuleHandler<TemplateAttributeNode> => ({
    name,
    streamType: 'TemplateAttribute',
    handle: handler,
    meta,
});
