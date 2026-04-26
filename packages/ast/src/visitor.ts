/**
 * Keys that are never AST children — skipped in every node to avoid false traversal.
 * Defined at module level so the Set is allocated once, not per call.
 */
const NON_CHILD_KEYS = new Set(['parent', 'span', 'loc', 'range', 'start', 'end', 'type']);

interface TraversableNode {
    readonly type: string;
}

function isTraversableNode(value: unknown): value is TraversableNode {
    return typeof value === 'object' && value !== null && typeof (value as { type?: unknown }).type === 'string';
}

/**
 * Iterative pre-order DFS walker for Oxc AST.
 *
 * Replaces the previous recursive implementation to eliminate two hotpath costs:
 *   1. Call-stack overflow risk on deeply nested ASTs (large files with many nested
 *      arrow functions, ternaries, optional chaining, etc.).
 *   2. `Object.keys()` allocation on every node — on a 10 000-node AST that was
 *      10 000 short-lived string arrays per file. `for...in` iterates without
 *      allocating the intermediate array.
 *
 * Traversal order: identical to the recursive version (pre-order DFS, children
 * visited in property-key insertion order). The engine relies only on the guarantee
 * that every node is visited; it does NOT depend on parent-before-child ordering
 * beyond what pre-order naturally provides.
 *
 * @param root    - The Program (or any sub-tree root) to walk
 * @param visitor - Called for each node. Return `false` to skip that node's children.
 */
export function walkProgram(
    root: TraversableNode | null | undefined,
    visitor: (node: TraversableNode) => void | boolean
): void {
    if (!root) return;

    // Explicit stack replaces the call stack — no recursion depth limit.
    // We push children in reverse insertion order so that the first property's
    // subtree is processed before subsequent ones (matching recursive pre-order).
    const stack: TraversableNode[] = [root];

    while (stack.length > 0) {
        const node = stack.pop();
        if (!node) continue;

        const shouldContinue = visitor(node);
        if (shouldContinue === false) continue;

        // Collect children before pushing so we can reverse them for correct order.
        // A local temp array here is unavoidable for reversal, but it is tiny
        // (typically 2–8 entries) compared to the 50–100 key array that
        // Object.keys() was allocating on every node previously.
        const children: TraversableNode[] = [];

        const nodeRecord = node as unknown as Record<string, unknown>;
        for (const key in nodeRecord) {
            // Skip non-child properties without allocating an array
            if (NON_CHILD_KEYS.has(key)) continue;

            const val = nodeRecord[key];
            if (!val || typeof val !== 'object') continue;

            if (Array.isArray(val)) {
                for (let i = 0; i < val.length; i++) {
                    const child = val[i];
                    if (isTraversableNode(child)) {
                        children.push(child);
                    }
                }
            } else if (isTraversableNode(val)) {
                children.push(val);
            }
        }

        // Push in reverse so the first child is popped (processed) first
        for (let i = children.length - 1; i >= 0; i--) {
            stack.push(children[i]);
        }
    }
}
