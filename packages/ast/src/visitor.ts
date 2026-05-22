/**
 * @fileoverview
 * Iterative pre-order DFS walker for Oxc-produced ASTs.
 *
 * Replaces a recursive implementation to eliminate two hot-path costs:
 *  1. Stack-overflow risk on deeply nested ASTs (large files with many
 *     nested arrow functions, ternaries, or optional chains).
 *  2. `Object.keys()` allocation per node — on a 10 000-node AST that was
 *     10 000 short-lived string arrays. `for...in` iterates without
 *     allocating an intermediate array.
 *
 * Traversal order matches the recursive version (pre-order DFS, children
 * visited in property-key insertion order). The engine relies only on the
 * "every node is visited" guarantee, not on a specific sibling order.
 */

/** Keys that are never AST children. Skipped during traversal to avoid false descent. */
const NON_CHILD_KEYS = new Set(['parent', 'span', 'loc', 'range', 'start', 'end', 'type']);

interface TraversableNode {
    readonly type: string;
}

/** Type guard: returns `true` for plain AST node objects (object with `type: string`). */
function isTraversableNode(value: unknown): value is TraversableNode {
    return typeof value === 'object'
        && value !== null
        && typeof (value as { type?: unknown }).type === 'string';
}

/**
 * Walks `root` and its descendants in pre-order, invoking `visitor` per node.
 *
 * @param root    - The Program (or any sub-tree root) to walk.
 * @param visitor - Called for each node. Return `false` to skip that node's children.
 * @returns {void}
 */
export function walkProgram(
    root: TraversableNode | null | undefined,
    visitor: (node: TraversableNode) => void | boolean,
): void {
    if (!root) return;

    // Explicit stack replaces the call stack — no recursion-depth limit.
    // Children are pushed in reverse insertion order so the first property's
    // subtree is processed first (matching recursive pre-order).
    const stack: TraversableNode[] = [root];

    while (stack.length > 0) {
        const node = stack.pop();
        if (!node) continue;

        if (visitor(node) === false) continue;

        // A small local array is unavoidable for the reversal step, but it is
        // tiny (typically 2–8 entries) compared to the 50–100 element key
        // array `Object.keys()` allocated on every node previously.
        const children: TraversableNode[] = [];
        const nodeRecord = node as unknown as Record<string, unknown>;

        for (const key in nodeRecord) {
            if (NON_CHILD_KEYS.has(key)) continue;
            const val = nodeRecord[key];
            if (!val || typeof val !== 'object') continue;

            if (Array.isArray(val)) {
                for (let i = 0; i < val.length; i++) {
                    const child = val[i];
                    if (isTraversableNode(child)) children.push(child);
                }
            } else if (isTraversableNode(val)) {
                children.push(val);
            }
        }

        for (let i = children.length - 1; i >= 0; i--) {
            stack.push(children[i]);
        }
    }
}
