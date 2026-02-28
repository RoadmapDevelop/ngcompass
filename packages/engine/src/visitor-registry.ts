/**
 * Visitor Registry — O(1) Node Dispatch
 *
 * Replaces the `if/else` chain in the single-pass engine with a Map-keyed
 * dispatch table. Each Oxc node.type string maps directly to an array of
 * pre-built visitor functions, giving O(1) lookup per node.
 *
 * Adding a new StreamType requires:
 *  1. Adding the entry to STREAM_TO_NODE_TYPE (compile-time exhaustiveness enforced)
 *  2. Adding the stream filter to the streamFilters argument of buildVisitorMap()
 *
 * The engine itself (single-pass-engine.ts) never needs to change.
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
 * Builds an O(1) dispatch map from an array of rule handlers.
 *
 * @param handlers - All rule handlers for this analysis run
 * @param streamFilters - Maps StreamType → filter function (raw node → stream node | null)
 * @returns Immutable VisitorMap keyed by Oxc node.type strings
 *
 * Template-stream handlers (TemplateExpression, TemplateAttribute) are intentionally
 * excluded — they are dispatched via analyzeTemplate() after the main walk.
 */
export function buildVisitorMap(
    handlers: ReadonlyArray<RuleHandler<any>>,
    streamFilters: Partial<Record<StreamType, (rawNode: any) => any | null>>,
): VisitorMap {
    const mutable = new Map<string, VisitorEntry[]>();

    for (const handler of handlers) {
        const nodeType = STREAM_TO_NODE_TYPE[handler.streamType];

        // Skip template-stream handlers — sentinel prefix '__' means post-walk dispatch
        if (!nodeType || nodeType.startsWith('__')) continue;

        const filter = streamFilters[handler.streamType];
        if (!filter) continue; // No filter registered for this stream type → skip

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

