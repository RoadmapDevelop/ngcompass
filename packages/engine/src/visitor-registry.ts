/**
 * @fileoverview
 * Implements a high-performance visitor registry for O(1) node dispatch.
 *
 * This module facilitates the routing of AST nodes to their respective rule
 * handlers by utilizing a static dispatch table, significantly optimizing the
 * throughput of the single-pass engine.
 */

import type { RuleHandler, StreamType } from './rule-handler.js';
import type { RuleFailure, RuleContext } from './types.js';

// ============================================
// STREAM → NODE TYPE MAPPING
// ============================================

/**
 * Compile-time exhaustiveness check.
 * Every StreamType MUST have an entry here.
 * Template streams use a sentinel prefix '__' — they are dispatched
 * separately after the main AST walk and are skipped in buildVisitorMap.
 */
type StreamToNodeType = { [K in StreamType]: string };

export const STREAM_TO_NODE_TYPE: StreamToNodeType = {
    AngularClass: 'ClassDeclaration',
    AnyAngularClass: 'ClassDeclaration',     // same Oxc node type, different filter
    DecoratedProperty: 'PropertyDefinition',
    TemplateExpression: '__template_expression__', // dispatched post-walk
    TemplateAttribute: '__template_attribute__',   // dispatched post-walk
    CallExpression: 'CallExpression',
    NewExpression: 'NewExpression',
};

// ============================================
// VISITOR MAP TYPE
// ============================================

/**
 * A visitor entry bundles:
 *  - the raw-node → stream-node filter function
 *  - the rule handler
 *  - failure collection reference
 *  - per-rule timing reference
 *
 * This avoids closure allocation on the hot path by pre-binding everything
 * at registry build time.
 */
export interface VisitorEntry {
    /** Rule name (for failure collection and timing) */
    readonly ruleName: string;
    /** Converts raw Oxc node → typed stream node (or null if not applicable) */
    readonly filter: (rawNode: any) => any | null;
    /** The rule handler's handle function (pre-bound) */
    readonly handle: (streamNode: any, ctx: RuleContext) => RuleFailure | RuleFailure[] | null;
}

/**
 * Maps Oxc node.type → array of VisitorEntry.
 * Lookup is O(1) (Map.get), dispatch is O(H) where H = handlers for that type.
 */
export type VisitorMap = ReadonlyMap<string, ReadonlyArray<VisitorEntry>>;

// ============================================
// BUILDER
// ============================================

/**
 * Constructs a high-speed dispatch map from a collection of rule handlers.
 *
 * @param handlers A collection of rule handlers to include in the registry.
 * @param streamFilters A mapping of stream types to their respective node filters.
 * @returns A read-only VisitorMap optimized for O(1) lookup.
 */
export function buildVisitorMap(
    handlers: ReadonlyArray<RuleHandler<any>>,
    streamFilters: Partial<Record<StreamType, (rawNode: any) => any | null>>,
): VisitorMap {
    const mutable = new Map<string, VisitorEntry[]>();

    for (const handler of handlers) {
        const nodeType = STREAM_TO_NODE_TYPE[handler.streamType];

        if (!nodeType || nodeType.startsWith('__')) continue;

        const filter = streamFilters[handler.streamType];
        if (!filter) continue;

        const entry: VisitorEntry = {
            ruleName: handler.name,
            filter,
            handle: handler.handle.bind(handler),
        };

        const existing = mutable.get(nodeType);
        if (existing) {
            existing.push(entry);
        } else {
            mutable.set(nodeType, [entry]);
        }
    }

    return mutable as VisitorMap;
}

